#include "../include/convolution_filter.h"
#include <algorithm>
#include <array>
#include <cassert>
#include <cmath>
#include <complex>
#include <cstring>
#include <vector>
#include <xmmintrin.h>

namespace {
constexpr int Block=128, Size=Block*2;
using Complex=std::complex<float>;
using Spectrum=std::array<Complex,Size>;
// FFT plans are immutable and shared; the audio filter owns all mutable history.
struct Plan {
    std::array<int,Size> reversed{};
    Spectrum roots{};
    Plan(){for(int i=0;i<Size;i++){int x=i,v=0;for(int bit=0;bit<8;bit++){v=(v<<1)|(x&1);x>>=1;}reversed[i]=v;roots[i]=std::polar(1.0f,static_cast<float>(-2*3.141592653589793*i/Size));}}
};
void fft(Spectrum &a,bool inverse=false){
    static const Plan plan;
    for(int i=0;i<Size;i++)if(i<plan.reversed[i])std::swap(a[i],a[plan.reversed[i]]);
    for(int length=2;length<=Size;length*=2){int half=length/2,stride=Size/length;for(int base=0;base<Size;base+=length)for(int k=0;k<half;k++){auto root=plan.roots[k*stride];if(inverse)root=std::conj(root);const auto u=a[base+k],v=a[base+k+half]*root;a[base+k]=u+v;a[base+k+half]=u-v;}}
    if(inverse)for(auto &x:a)x/=Size;
}
float dot(const float *a,const float *b,int count){
    __m128 s0=_mm_setzero_ps(),s1=s0,s2=s0,s3=s0;int i=0;
    for(;i+16<=count;i+=16){s0=_mm_add_ps(s0,_mm_mul_ps(_mm_loadu_ps(a+i),_mm_loadu_ps(b+i)));s1=_mm_add_ps(s1,_mm_mul_ps(_mm_loadu_ps(a+i+4),_mm_loadu_ps(b+i+4)));s2=_mm_add_ps(s2,_mm_mul_ps(_mm_loadu_ps(a+i+8),_mm_loadu_ps(b+i+8)));s3=_mm_add_ps(s3,_mm_mul_ps(_mm_loadu_ps(a+i+12),_mm_loadu_ps(b+i+12)));}
    auto sum=_mm_add_ps(_mm_add_ps(s0,s1),_mm_add_ps(s2,s3));
    for(;i+4<=count;i+=4)sum=_mm_add_ps(sum,_mm_mul_ps(_mm_loadu_ps(a+i),_mm_loadu_ps(b+i)));
    float lane[4];_mm_storeu_ps(lane,sum);float result=lane[0]+lane[1]+lane[2]+lane[3];for(;i<count;i++)result+=a[i]*b[i];return result;
}
}

// The first 128 taps are evaluated immediately. The FFT tail starts at tap 128,
// so its next output block is ready before it is needed: no added block latency.
struct ConvolutionFilter::Partitioned {
    int position=0,historyIndex=0;
    std::array<float,Block> block{},tail{},overlap{};
    std::vector<Spectrum> kernels,history;
    Partitioned(const float *ir,int samples){
        const int count=(samples-Block+Block-1)/Block;
        kernels.resize(count);history.resize(count);
        for(int p=0;p<count;p++){auto &kernel=kernels[p];for(int j=0;j<Block;j++){const int tap=(p+1)*Block+j;if(tap<samples)kernel[j]=ir[tap];}fft(kernel);}
    }
    float push(float sample){
        const float out=tail[position];block[position++]=sample;
        if(position==Block){
            Spectrum x{},sum{};for(int i=0;i<Block;i++)x[i]=block[i];fft(x);history[historyIndex]=x;
            const int count=kernels.size();
            // Two finite complex multiply-adds per SSE register; preserve every IR tap.
            const __m128 sign=_mm_set_ps(0.0f,-0.0f,0.0f,-0.0f);
            auto *acc=reinterpret_cast<float *>(sum.data());
            for(int p=0;p<count;p++){
                const auto *h=reinterpret_cast<const float *>(kernels[p].data());
                const auto *v=reinterpret_cast<const float *>(history[(historyIndex-p+count)%count].data());
                for(int k=0;k<Size*2;k+=4){
                    const auto hv=_mm_loadu_ps(h+k),vv=_mm_loadu_ps(v+k);
                    const auto real=_mm_shuffle_ps(hv,hv,_MM_SHUFFLE(2,2,0,0));
                    const auto imag=_mm_shuffle_ps(hv,hv,_MM_SHUFFLE(3,3,1,1));
                    const auto swap=_mm_shuffle_ps(vv,vv,_MM_SHUFFLE(2,3,0,1));
                    const auto product=_mm_add_ps(_mm_mul_ps(real,vv),_mm_xor_ps(_mm_mul_ps(imag,swap),sign));
                    _mm_storeu_ps(acc+k,_mm_add_ps(_mm_loadu_ps(acc+k),product));
                }
            }
            fft(sum,true);for(int i=0;i<Block;i++){tail[i]=sum[i].real()+overlap[i];overlap[i]=sum[i+Block].real();}
            historyIndex=(historyIndex+1)%count;position=0;
        }
        return out;
    }
};

ConvolutionFilter::ConvolutionFilter(){m_shiftRegister=nullptr;m_impulseResponse=nullptr;m_shiftOffset=0;m_sampleCount=0;}
ConvolutionFilter::~ConvolutionFilter(){assert(m_shiftRegister==nullptr);assert(m_impulseResponse==nullptr);assert(m_partitioned==nullptr);}
void ConvolutionFilter::initialize(int samples){m_sampleCount=samples;m_shiftOffset=0;m_shiftRegister=new float[samples]();m_impulseResponse=new float[samples]();}
void ConvolutionFilter::destroy(){delete m_partitioned;m_partitioned=nullptr;delete[] m_shiftRegister;delete[] m_impulseResponse;m_shiftRegister=nullptr;m_impulseResponse=nullptr;}
float ConvolutionFilter::f(float sample){
    if(m_sampleCount<=0)return 0;
    if(m_sampleCount>Block*2&&!m_partitioned)m_partitioned=new Partitioned(m_impulseResponse,m_sampleCount);
    m_shiftRegister[m_shiftOffset]=sample;
    const int direct=m_partitioned?Block:m_sampleCount,first=std::min(direct,m_sampleCount-m_shiftOffset);
    float result=dot(m_impulseResponse,m_shiftRegister+m_shiftOffset,first);
    if(first<direct)result+=dot(m_impulseResponse+first,m_shiftRegister,direct-first);
    if(m_partitioned)result+=m_partitioned->push(sample);
    m_shiftOffset=(m_shiftOffset-1+m_sampleCount)%m_sampleCount;return result;
}
