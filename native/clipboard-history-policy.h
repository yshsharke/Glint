#pragma once
#include <cstdint>
#include <set>
#include <string>

namespace glint {
// Keep the destructive decision independent of Windows APIs so boundary and
// collision cases can be verified without touching a user's clipboard history.
inline bool MayInspectHistoryEntry(const std::set<std::wstring>& existing,
                                  const std::wstring& id, int64_t timestamp,
                                  int64_t started, int64_t copied) {
    return !id.empty() && existing.count(id) == 0 && timestamp >= started && timestamp <= copied;
}
inline bool MayDeleteHistoryEntry(bool clipboardUnchanged, size_t matchingNewEntries) {
    return clipboardUnchanged && matchingNewEntries == 1;
}
}
