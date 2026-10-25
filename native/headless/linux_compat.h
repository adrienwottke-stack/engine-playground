#ifndef ENGINE_PLAYGROUND_LINUX_COMPAT_H
#define ENGINE_PLAYGROUND_LINUX_COMPAT_H

// Upstream MSVC spellings and implicit standard includes, scoped to this Linux build.
// Algorithms and on-disk upstream files stay identical to the existing headless core.
#include <algorithm>
#include <cassert>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <new>
#include <unistd.h>

#ifndef __forceinline
#define __forceinline inline __attribute__((always_inline))
#endif
#ifndef __int64
#define __int64 long long
#endif

#endif
