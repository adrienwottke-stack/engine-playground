#include "../native/headless/engine/include/gas_system.h"
#undef ATG_ENGINE_SIM_GAS_SYSTEM_H
#define GasSystem ReferenceGasSystem
#include "../native/headless/engine/include/gas_system.h"
#undef GasSystem
#include <random>
#include <cmath>
#include <iostream>
#include <stdexcept>
#include <limits>
struct Probe:GasSystem{State &state(){return m_state;}};
struct ReferenceProbe:ReferenceGasSystem{State &state(){return m_state;}};
int main(){
 std::mt19937 rng(20261024);std::uniform_real_distribution<double> u(0,1);
 int comparisons=0;
 for(int trial=0;trial<20000;trial++){
  Probe a,b;ReferenceProbe ra,rb;
  const double pa=10000+u(rng)*1e7,pb=10000+u(rng)*1e7,va=.0001+u(rng)*.01,vb=.0001+u(rng)*.01,ta=200+u(rng)*2500,tb=200+u(rng)*2500;
  a.initialize(pa,va,ta);b.initialize(pb,vb,tb);ra.initialize(pa,va,ta);rb.initialize(pb,vb,tb);
  for(int j=0;j<2;j++){const double x=(u(rng)-.5)*.01,y=(u(rng)-.5)*.01;a.state().momentum[j]=ra.state().momentum[j]=x;b.state().momentum[j]=rb.state().momentum[j]=y;}
  if(trial%100==0)a.state().E_k=ra.state().E_k=-1;
  if(trial%100==1)a.state().momentum[0]=ra.state().momentum[0]=std::numeric_limits<double>::quiet_NaN();
  GasSystem::FlowParameters p{};ReferenceGasSystem::FlowParameters rp{};
  p.k_flow=rp.k_flow=trial%2?0:1e-7*u(rng);p.dt=rp.dt=1e-5;p.direction_x=rp.direction_x=1;p.direction_y=rp.direction_y=0;
  p.crossSectionArea_0=rp.crossSectionArea_0=.001;p.crossSectionArea_1=rp.crossSectionArea_1=.002;
  p.system_0=&a;p.system_1=&b;rp.system_0=&ra;rp.system_1=&rb;
  const double fa=GasSystem::flow(p),fr=ReferenceGasSystem::flow(rp);
  auto equal=[&](double x,double y){if(std::isnan(x)&&std::isnan(y))return;if(x==y)return;if(!std::isfinite(x)||!std::isfinite(y)||std::abs(x-y)>1e-12*std::max(1.0,std::abs(y)))throw std::runtime_error("gas mismatch");comparisons++;};
  equal(fa,fr);
  auto compare=[&](auto &s,auto &r){equal(s.n_mol,r.n_mol);equal(s.E_k,r.E_k);equal(s.V,r.V);equal(s.momentum[0],r.momentum[0]);equal(s.momentum[1],r.momentum[1]);equal(s.mix.p_fuel,r.mix.p_fuel);equal(s.mix.p_inert,r.mix.p_inert);equal(s.mix.p_o2,r.mix.p_o2);};
  compare(a.state(),ra.state());compare(b.state(),rb.state());
 }
 std::cout<<"20000 gas transfers, open/closed valves and invalid-state fallback passed (relative tolerance 1e-12)\n";
}
