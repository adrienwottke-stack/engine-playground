#include "../native/headless/engine/include/delay_filter.h"
#include <cassert>
#include <cmath>
#include <iostream>

int main() {
    DelayFilter filter;
    for (int hz : {10000, 4000, 6000, 10000}) {
        const double seconds=1.2/343.0;
        const int samples=static_cast<int>(std::round(seconds*hz));
        filter.initialize(seconds,hz);
        for(int i=0;i<samples;i++)assert(filter.fast_f(i==0?1:0)==0);
        assert(filter.fast_f(0)==1);
        for(int i=0;i<samples+3;i++)assert(filter.fast_f(0)==0);
        assert(std::abs(samples/double(hz)-seconds)<=.5/hz);
    }
    std::cout << "Propagation delay retained within half a physics sample at 4/6/10 kHz, including reinitialization\n";
}
