#include "../native/headless/solver/include/gauss_seidel_sle_solver.h"
#undef ATG_SIMPLE_2D_CONSTRAINT_SOLVER_SEIDEL_SLE_SOLVER_H
#define GaussSeidelSleSolver ReferenceGaussSeidelSleSolver
#include "../native/headless/solver/include/gauss_seidel_sle_solver.h"
#undef GaussSeidelSleSolver
#include <random>
#include <iostream>
#include <cmath>
#include <limits>
#include <stdexcept>
int main(){
 std::mt19937 random(1202410);std::uniform_real_distribution<double> value(-1,1);
 int comparisons=0;
 for(int trial=0;trial<500;trial++){
  const int n=3+trial%61;
  atg_scs::SparseMatrix<3> J;J.initialize(n*3,n);
  for(int i=0;i<n;i++){J.setBlock(i,0,i);J.setBlock(i,1,(i+1)%n);for(int j=0;j<3;j++){J.set(i,0,j,j==0?2+value(random)*.2:value(random));J.set(i,1,j,value(random)*.3);}}
  atg_scs::Matrix W(1,n*3,1),right(1,n),limits(2,n),initial(1,n),a(1,n),b(1,n);
  for(int i=0;i<n;i++){right.set(0,i,value(random)*100);limits.set(0,i,-10-i);limits.set(1,i,10+i);initial.set(0,i,value(random));}
  if(trial%20==0)initial.set(0,0,std::numeric_limits<double>::quiet_NaN());
  atg_scs::GaussSeidelSleSolver fast;atg_scs::ReferenceGaussSeidelSleSolver reference;
  bool fa=fast.solveWithLimits(J,W,right,limits,&a,&initial),fb=reference.solveWithLimits(J,W,right,limits,&b,&initial);
  if(fa!=fb)throw std::runtime_error("changed convergence");
  for(int i=0;i<n;i++){if(a.get(0,i)!=b.get(0,i))throw std::runtime_error("changed limited solution");comparisons++;}
  if(trial%20!=0){fa=fast.solve(J,W,right,&initial,&a);fb=reference.solve(J,W,right,&initial,&b);if(fa!=fb)throw std::runtime_error("changed unlimited convergence");for(int i=0;i<n;i++){if(a.get(0,i)!=b.get(0,i))throw std::runtime_error("changed unlimited solution");comparisons++;}}
  J.destroy();W.destroy();right.destroy();limits.destroy();initial.destroy();a.destroy();b.destroy();
 }
 std::cout<<"solver comparisons "<<comparisons<<" exact finite values, 500 systems, limits/unlimited, NaN fallback passed\n";
}
