#pragma once
#include <windows.h>
#include <memory>
#include <string>

namespace glint {
// Caller must have the clipboard open. A restoration must not create another
// Win+V entry or upload the restored data to Cloud Clipboard.
void ExcludeRestorationFromHistory() noexcept;

enum class HistoryCleanup { Unavailable, NoMatch, Removed, Skipped };

// Lives entirely in the selection utility process. Never clears history and
// never reads the contents of entries present before the capture.
class ClipboardHistoryCapture {
public:
    ClipboardHistoryCapture() noexcept;
    ~ClipboardHistoryCapture();
    ClipboardHistoryCapture(const ClipboardHistoryCapture&) = delete;
    ClipboardHistoryCapture& operator=(const ClipboardHistoryCapture&) = delete;
    void ObserveCopy(HWND source, const std::wstring& text) noexcept;
    HistoryCleanup Finish(DWORD restoredSequence) noexcept;
private:
    struct State;
    std::unique_ptr<State> state_;
};
}
