#include "../native/headless/solver/include/sparse_matrix.h"
#include <random>
#include <vector>
#include <thread>
#include <cmath>
#include <iostream>
#include <stdexcept>
void check(int seed){
 std::mt19937 rng(seed);std::uniform_real_distribution<double> value(-10,10);
 for(int trial=0;trial<300;trial++){
  const int n=trial%43,m=(trial*7)%47,bodies=16;
  atg_scs::SparseMatrix<3> a,b;a.initialize(bodies*3,n);b.initialize(bodies*3,m);
  std::vector<int> ak(n*2),bk(m*2);
  for(int i=0;i<n*2;i++)ak[i]=rng()%17-1;
  for(int i=0;i<m*2;i++)bk[i]=rng()%17-1;
  atg_scs::Matrix out;
  for(int repeat=0;repeat<5;repeat++){
   if(repeat==3&&n)ak[0]=rng()%16;
   for(int i=0;i<n;i++)for(int k=0;k<2;k++){const int block=ak[i*2+k];if(block<0)a.setEmpty(i,k);else{a.setBlock(i,k,block);for(int l=0;l<3;l++)a.set(i,k,l,value(rng));}}
   for(int i=0;i<m;i++)for(int k=0;k<2;k++){const int block=bk[i*2+k];if(block<0)b.setEmpty(i,k);else{b.setBlock(i,k,block);for(int l=0;l<3;l++)b.set(i,k,l,value(rng));}}
   a.multiplyTranspose(b,&out);
   for(int i=0;i<n;i++)for(int j=0;j<m;j++){
    double dot=0;for(int k=0;k<2;k++){if(ak[i*2+k]<0)continue;for(int l=0;l<2;l++)if(ak[i*2+k]==bk[j*2+l])for(int at=0;at<3;at++)dot+=a.get(i,k,at)*b.get(j,l,at);}
    if(out.get(j,i)!=dot)throw std::runtime_error("cached block plan changed dot product");
   }
  }
  out.destroy();a.destroy();b.destroy();
 }
}
int main(){std::vector<std::thread> threads;for(int i=0;i<4;i++)threads.emplace_back(check,20261024+i);for(auto &thread:threads)thread.join();std::cout<<"1200 sparse systems x5 updates, empty/duplicate blocks, changing topology, 4 threads: exact reference products passed\n";}
