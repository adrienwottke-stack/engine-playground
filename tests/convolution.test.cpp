#include "../native/headless/engine/include/convolution_filter.h"
#include <algorithm>
#include <chrono>
#include <cmath>
#include <iostream>
#include <vector>

struct Reference {
    std::vector<float> ring,ir; int offset=0;
    Reference(int n):ring(n),ir(n){}
    float f(float sample) {
        ring[offset]=sample; float result=0; const int n=ring.size();
        for(int i=0;i<n-offset;i++)result+=ir[i]*ring[i+offset];
        for(int i=n-offset;i<n;i++)result+=ir[i]*ring[i-(n-offset)];
        offset=(offset-1+n)%n; return result;
    }
};
int main() {
    double maxError=0;
    for(int n:{1,3,17,128,256,257,509,4096,6907,10000}) {
        Reference reference(n);ConvolutionFilter filter;filter.initialize(n);
        for(int i=0;i<n;i++)filter.getImpulseResponse()[i]=reference.ir[i]=std::sin(i*.31f)*std::exp(-i*.002f)/n;
        for(int i=0;i<n*3+100;i++) {
            const float value=std::sin(i*.17f)+std::cos(i*.071f);
            const double error=std::abs(filter.f(value)-reference.f(value));maxError=std::max(error,maxError);
            if(error>1e-5){std::cerr<<"Convolution mismatch "<<n<<" "<<error;return 1;}
        }
        filter.destroy();
    }
    Reference reference(4096);ConvolutionFilter filter;filter.initialize(4096);
    for(int i=0;i<4096;i++)filter.getImpulseResponse()[i]=reference.ir[i]=std::sin(i*.31f)/4096;
    using Clock=std::chrono::steady_clock;volatile float sink=0;
    auto begin=Clock::now();for(int i=0;i<30000;i++)sink=reference.f(std::sin(i*.17f));
    const double scalar=std::chrono::duration<double,std::milli>(Clock::now()-begin).count();
    begin=Clock::now();for(int i=0;i<30000;i++)sink=filter.f(std::sin(i*.17f));
    const double simd=std::chrono::duration<double,std::milli>(Clock::now()-begin).count();filter.destroy();
    std::cout<<"{\"maxAbsoluteError\":"<<maxError<<",\"scalarMs\":"<<scalar<<",\"simdMs\":"<<simd<<",\"speedup\":"<<scalar/simd<<"}\n";
    return 0;
}
