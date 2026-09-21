#include "clipboard-history.h"
#include "clipboard-history-policy.h"
#include <winrt/Windows.ApplicationModel.DataTransfer.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <chrono>
#include <set>
#include <vector>

namespace glint {
using namespace winrt::Windows::ApplicationModel::DataTransfer;
using namespace std::chrono_literals;

void ExcludeRestorationFromHistory() noexcept {
    const UINT format = RegisterClipboardFormatW(L"ExcludeClipboardContentFromMonitorProcessing");
    if (!format) return;
    HGLOBAL data = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, sizeof(DWORD));
    if (data && !SetClipboardData(format, data)) GlobalFree(data);
}

namespace {
template<class T> bool Complete(const T& operation, std::chrono::milliseconds timeout) {
    if (operation.wait_for(timeout) == winrt::Windows::Foundation::AsyncStatus::Completed) return true;
    operation.Cancel();
    return false;
}
std::vector<ClipboardHistoryItem> ReadHistory() {
    auto operation = Clipboard::GetHistoryItemsAsync();
    if (!Complete(operation, 80ms)) throw winrt::hresult_error(E_ABORT);
    auto result = operation.GetResults();
    if (result.Status() != ClipboardHistoryItemsResultStatus::Success) throw winrt::hresult_error(E_ACCESSDENIED);
    auto items = result.Items();
    return { items.begin(), items.end() };
}
}

struct ClipboardHistoryCapture::State {
    bool apartment = false;
    bool ready = false;
    bool observed = false;
    std::set<std::wstring> before;
    winrt::Windows::Foundation::DateTime started;
    winrt::Windows::Foundation::DateTime copied;
    std::wstring text;
    ~State() { if (apartment) winrt::uninit_apartment(); }
};

ClipboardHistoryCapture::ClipboardHistoryCapture() noexcept {
    try {
        state_ = std::make_unique<State>();
        winrt::init_apartment(winrt::apartment_type::multi_threaded);
        state_->apartment = true;
        if (!Clipboard::IsHistoryEnabled()) return;
        for (const auto& item : ReadHistory()) state_->before.emplace(item.Id().c_str());
        state_->started = winrt::clock::now();
        state_->ready = true;
    } catch (...) { /* Optional Windows feature; capture must still work. */ }
}

ClipboardHistoryCapture::~ClipboardHistoryCapture() = default;

void ClipboardHistoryCapture::ObserveCopy(HWND source, const std::wstring& text) noexcept {
    if (!state_ || !state_->ready || text.empty()) return;
    DWORD sourceProcess = 0, ownerProcess = 0;
    GetWindowThreadProcessId(source, &sourceProcess);
    GetWindowThreadProcessId(GetClipboardOwner(), &ownerProcess);
    if (!sourceProcess || ownerProcess != sourceProcess) return;
    try {
        state_->text = text;
        state_->copied = winrt::clock::now();
        state_->observed = true;
    } catch (...) { state_->observed = false; }
}

HistoryCleanup ClipboardHistoryCapture::Finish(DWORD restoredSequence) noexcept {
    if (!state_ || !state_->ready) return HistoryCleanup::Unavailable;
    if (!state_->observed) return HistoryCleanup::Skipped;
    try {
        const auto deadline = std::chrono::steady_clock::now() + 240ms;
        do {
            // Abort if the user or another program copied anything after restoration.
            if (GetClipboardSequenceNumber() != restoredSequence) return HistoryCleanup::Skipped;
            auto items = ReadHistory();
            ClipboardHistoryItem candidate{ nullptr };
            for (const auto& item : items) {
                // A delayed or ambiguous record is retained rather than guessed at.
                if (!MayInspectHistoryEntry(state_->before, item.Id().c_str(), item.Timestamp().time_since_epoch().count(),
                    state_->started.time_since_epoch().count(), state_->copied.time_since_epoch().count())) continue;
                if (!item.Content().Contains(StandardDataFormats::Text())) continue;
                auto text = item.Content().GetTextAsync();
                if (!Complete(text, 40ms)) return HistoryCleanup::Skipped;
                if (text.GetResults() != state_->text) continue;
                if (candidate) return HistoryCleanup::Skipped;
                candidate = item;
            }
            if (candidate) {
                // Hold the clipboard only for the final identity check and deletion,
                // so a concurrent manual copy cannot race this last check.
                if (!OpenClipboard(nullptr)) return HistoryCleanup::Skipped;
                bool removed = false;
                try {
                    if (MayDeleteHistoryEntry(GetClipboardSequenceNumber() == restoredSequence, 1))
                        removed = Clipboard::DeleteItemFromHistory(candidate);
                } catch (...) { }
                CloseClipboard();
                return removed ? HistoryCleanup::Removed : HistoryCleanup::Skipped;
            }
            Sleep(20);
        } while (std::chrono::steady_clock::now() < deadline);
        return HistoryCleanup::NoMatch;
    } catch (...) { return HistoryCleanup::Unavailable; }
}
}
