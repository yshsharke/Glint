#include "clipboard-history.h"
#include "clipboard-history-policy.h"
#include "clipboard.h"
#include <winrt/Windows.ApplicationModel.DataTransfer.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <iostream>
#include <set>
#include <stdexcept>
#include <chrono>

using namespace winrt::Windows::ApplicationModel::DataTransfer;
using namespace std::chrono_literals;
void require(bool value, const char* message) { if (!value) throw std::runtime_error(message); }
auto history() {
    auto operation = Clipboard::GetHistoryItemsAsync();
    require(operation.wait_for(1s) == winrt::Windows::Foundation::AsyncStatus::Completed, "history API timeout");
    auto result = operation.GetResults();
    require(result.Status() == ClipboardHistoryItemsResultStatus::Success, "history API unavailable");
    return result.Items();
}
std::set<std::wstring> ids() {
    std::set<std::wstring> result;
    for (auto item : history()) result.emplace(item.Id().c_str());
    return result;
}
bool hasText(const std::wstring& text, const std::set<std::wstring>& original) {
    for (auto item : history()) {
        if (original.count(item.Id().c_str()) || !item.Content().Contains(StandardDataFormats::Text())) continue;
        auto operation = item.Content().GetTextAsync();
        if (operation.wait_for(1s) == winrt::Windows::Foundation::AsyncStatus::Completed && operation.GetResults() == text) return true;
    }
    return false;
}
void write(HWND owner, const std::wstring& text) {
    require(OpenClipboard(owner), "open test clipboard");
    EmptyClipboard();
    HGLOBAL data = GlobalAlloc(GMEM_MOVEABLE, (text.size() + 1) * sizeof(wchar_t));
    if (!data) { CloseClipboard(); throw std::runtime_error("allocate clipboard"); }
    void* memory = GlobalLock(data);
    if (!memory) { GlobalFree(data); CloseClipboard(); throw std::runtime_error("lock clipboard"); }
    memcpy(memory, text.c_str(), (text.size() + 1) * sizeof(wchar_t));
    GlobalUnlock(data);
    const bool success = SetClipboardData(CF_UNICODETEXT, data) != nullptr;
    if (!success) GlobalFree(data);
    CloseClipboard();
    require(success, "write test clipboard");
}

int main(int argc, char**) {
    winrt::init_apartment(winrt::apartment_type::multi_threaded);
    try {
        const std::set<std::wstring> previousIds{ L"original", L"same-text" };
        require(!glint::MayInspectHistoryEntry(previousIds, L"original", 150, 100, 200), "never inspect previous IDs");
        require(!glint::MayInspectHistoryEntry(previousIds, L"same-text", 150, 100, 200), "equal text cannot override an existing ID");
        require(!glint::MayInspectHistoryEntry(previousIds, L"older", 99, 100, 200), "skip delayed records older than capture");
        require(!glint::MayInspectHistoryEntry(previousIds, L"later", 201, 100, 200), "skip later records");
        require(glint::MayInspectHistoryEntry(previousIds, L"own", 150, 100, 200), "consider a new capture-window ID");
        require(!glint::MayDeleteHistoryEntry(false, 1), "never delete after another clipboard write");
        require(!glint::MayDeleteHistoryEntry(true, 0), "never delete without a match");
        require(!glint::MayDeleteHistoryEntry(true, 2), "never guess among ambiguous matches");
        require(glint::MayDeleteHistoryEntry(true, 1), "delete only one unambiguous matching ID");
        std::cout << "PASSED: history identity, timestamp, ambiguity and clipboard-race policy.\n";
        const bool enabled = Clipboard::IsHistoryEnabled();
        std::cout << "Windows clipboard history enabled: " << enabled << '\n';
        if (!enabled) { std::cout << "SKIPPED: history disabled; system preference unchanged.\n"; return 0; }
        const auto original = ids();
        std::cout << "Existing history entries: " << original.size() << '\n';
        if (argc > 1) return 0; // Read-only probe.
        ClipboardBackup saved;
        require(BackupClipboard(saved), "backup current clipboard");
        if (saved.HasData()) {
            require(RestoreClipboard(saved), "restore without adding history");
            require(IsClipboardFormatAvailable(RegisterClipboardFormatW(L"ExcludeClipboardContentFromMonitorProcessing")), "restoration contains Windows history exclusion marker");
            Sleep(250);
            require(ids() == original, "restoration must not change history IDs");
            std::cout << "PASSED: restoration excluded from real Windows clipboard history.\n";
        }
        if (original.size() > 20) { std::cout << "SKIPPED: live deletion test would risk evicting existing history entries.\n"; return 0; }
        HWND owner = CreateWindowW(L"STATIC", L"Glint history test", 0, 0, 0, 1, 1, HWND_MESSAGE, nullptr, GetModuleHandle(nullptr), nullptr);
        require(owner != nullptr, "create clipboard owner");
        const std::wstring prefix = L"Glint history test " + std::to_wstring(GetCurrentProcessId()) + L"-" + std::to_wstring(GetTickCount64());
        const auto keep = prefix + L" keep", temporary = prefix + L" temporary", manual = prefix + L" manual";
        auto cleanup = [&] {
            // Test cleanup is limited to this invocation's generated text and new IDs.
            for (auto item : history()) {
                if (original.count(item.Id().c_str()) || !item.Content().Contains(StandardDataFormats::Text())) continue;
                auto operation = item.Content().GetTextAsync();
                if (operation.wait_for(1s) != winrt::Windows::Foundation::AsyncStatus::Completed) continue;
                const std::wstring text = operation.GetResults().c_str();
                if (text == keep || text == temporary || text == manual) Clipboard::DeleteItemFromHistory(item);
            }
        };
        try {
            write(owner, keep); Sleep(400);
            require(hasText(keep, original), "test record enters history");
            ClipboardBackup beforeCopy; require(BackupClipboard(beforeCopy), "backup test content");
            {
                glint::ClipboardHistoryCapture capture;
                write(owner, temporary); Sleep(15);
                capture.ObserveCopy(owner, temporary);
                require(RestoreClipboard(beforeCopy), "restore test content");
                auto outcome = capture.Finish(GetClipboardSequenceNumber());
                std::cout << "Temporary record cleanup outcome: " << static_cast<int>(outcome) << '\n';
                Sleep(400);
                require(!hasText(temporary, original), "temporary capture removed from history");
                require(hasText(keep, original), "previous history retained");
            }
            {
                glint::ClipboardHistoryCapture capture;
                write(owner, temporary); Sleep(15);
                capture.ObserveCopy(owner, temporary);
                require(RestoreClipboard(beforeCopy), "restore before concurrent copy");
                const DWORD restored = GetClipboardSequenceNumber();
                write(owner, manual);
                require(capture.Finish(restored) == glint::HistoryCleanup::Skipped, "skip cleanup after concurrent copy");
                Sleep(400);
                require(hasText(manual, original), "concurrent manual copy retained");
            }
            {
                glint::ClipboardHistoryCapture capture;
                write(owner, keep); Sleep(15);
                capture.ObserveCopy(owner, keep);
                require(RestoreClipboard(beforeCopy), "restore identical content");
                capture.Finish(GetClipboardSequenceNumber()); Sleep(300);
                require(hasText(keep, original), "pre-existing equal text is not deleted");
            }
            const auto remaining = ids();
            for (const auto& id : original) require(remaining.count(id) != 0, "existing history IDs preserved");
            cleanup();
            require(RestoreClipboard(saved), "restore user clipboard");
            if (saved.isEmpty) { require(OpenClipboard(owner), "restore empty clipboard"); EmptyClipboard(); CloseClipboard(); }
            DestroyWindow(owner);
            std::cout << "PASSED: temporary record removal, previous IDs, equal text and concurrent copies.\n";
        } catch (...) {
            try { cleanup(); } catch (...) {}
            RestoreClipboard(saved);
            if (saved.isEmpty && OpenClipboard(owner)) { EmptyClipboard(); CloseClipboard(); }
            DestroyWindow(owner);
            throw;
        }
    } catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
      catch (const winrt::hresult_error& error) { std::cerr << "Windows history error: " << std::hex << error.code().value << '\n'; return 1; }
    return 0;
}
