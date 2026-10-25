// Engine Playground console host using Ange Yaghi's physical engine/audio algorithms.
// Own host and narrowly scoped portable/runtime accessors; see PORTED.json and licenses.
#include "engine/include/engine.h"
#include "engine/include/simulator.h"
#include "engine/include/camshaft.h"
#include "engine/scripting/include/compiler.h"
#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <cstdint>
#include <cstdlib>
#include <deque>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <locale>
#include <mutex>
#include <sstream>
#include <thread>
#include <vector>
#include <xmmintrin.h>
#if defined(_WIN32)
#include <fcntl.h>
#include <io.h>
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#endif

using Clock = std::chrono::steady_clock;
struct RealtimeTimer {
#if defined(_WIN32)
    HANDLE timer=CreateWaitableTimerExW(nullptr,nullptr,0x00000002,TIMER_ALL_ACCESS);
    ~RealtimeTimer(){if(timer)CloseHandle(timer);}
#endif
    void wait(Clock::time_point deadline){
        const auto remaining=deadline-Clock::now();if(remaining<=Clock::duration::zero())return;
#if defined(_WIN32)
        if(!timer){std::this_thread::sleep_until(deadline);return;}
        LARGE_INTEGER due;due.QuadPart=-std::max<long long>(1,std::chrono::duration_cast<std::chrono::nanoseconds>(remaining).count()/100);
        if(SetWaitableTimer(timer,&due,0,nullptr,nullptr,FALSE))WaitForSingleObject(timer,INFINITE);else std::this_thread::sleep_until(deadline);
#else
        // Steady-clock deadlines retain the same 10 ms pacing without OS privileges.
        std::this_thread::sleep_until(deadline);
#endif
    }
};
double wallMs() { return std::chrono::duration<double,std::milli>(std::chrono::system_clock::now().time_since_epoch()).count(); }
struct Command {
    std::uint64_t sequence=0, reset=0;
    double issued=0, throttle=0, clutch=0, loadNm=40, volume=.08, flywheel=.18, lag=0, mass=1450, finalDrive=3.15, radius=.31, drag=.65, rolling=.012, brake=0;
    double gears[5]={4.2,2.5,1.65,1.2,1};
    int active=0, ignition=0, starter=0, gear=0, load=0, preset=0, idleAssist=0, focusCylinder=1;
    double hf=.01,noise=1,jitter=.5,convolution=1;
};
std::mutex inputMutex; std::condition_variable inputCondition;
Command input;
std::atomic<bool> running{true};
struct Packet { std::uint32_t kind; std::vector<char> bytes; };
std::mutex outputMutex; std::condition_variable outputCondition; std::deque<Packet> packets;
void packet(std::uint32_t kind, const void *data, std::size_t size) {
    std::lock_guard<std::mutex> guard(outputMutex);
    if (packets.size()>40) { packets.pop_front(); }
    const auto p=static_cast<const char *>(data);
    packets.push_back({kind,std::vector<char>(p,p+size)}); outputCondition.notify_one();
}
void outputLoop() {
    while(true) {
        Packet p;
        { std::unique_lock<std::mutex> lock(outputMutex); outputCondition.wait_for(lock,std::chrono::milliseconds(30),[]{return !packets.empty() || !running;}); if(packets.empty()) {if(!running)break;continue;} p=std::move(packets.front()); packets.pop_front(); }
        std::uint32_t header[2]={p.kind,static_cast<std::uint32_t>(p.bytes.size())};
        std::cout.write(reinterpret_cast<const char *>(header),sizeof(header)); std::cout.write(p.bytes.data(),p.bytes.size()); std::cout.flush();
        if(!std::cout) running=false;
    }
}
void inputLoop() {
    std::string line;
    while(running && std::getline(std::cin,line)) {
        if(line.size()>2048) continue;
        std::istringstream s(line); Command c;
        if(!(s>>c.sequence>>c.issued>>c.active>>c.throttle>>c.ignition>>c.starter>>c.gear>>c.clutch>>c.load>>c.loadNm>>c.volume>>c.reset>>c.flywheel>>c.lag>>c.mass>>c.finalDrive>>c.radius>>c.drag>>c.rolling>>c.brake)) continue;
        bool valid=true; for(auto &g:c.gears) if(!(s>>g) || !std::isfinite(g) || g<.5 || g>5) valid=false;
        if(!(s>>c.preset>>c.idleAssist>>c.hf>>c.noise>>c.jitter>>c.convolution>>c.focusCylinder))valid=false;
        if(c.preset<0||c.preset>1||c.idleAssist<0||c.idleAssist>1||c.focusCylinder<1||c.focusCylinder>6)valid=false;
        for(double value:{c.hf,c.noise,c.jitter,c.convolution})if(!std::isfinite(value)||value<0||value>1)valid=false;
        std::string extra; if(s>>extra) valid=false;
        auto range=[](double x,double a,double b){return std::isfinite(x)&&x>=a&&x<=b;};
        if(!valid || !range(c.throttle,0,1)||!range(c.clutch,0,1)||!range(c.flywheel,.04,1)||!range(c.lag,0,2)||!range(c.mass,400,3000)||!range(c.finalDrive,2,5)||!range(c.radius,.2,.45)||!range(c.drag,0,1.5)||!range(c.rolling,0,.04)||!range(c.brake,0,1)||!range(c.loadNm,0,200)||c.gear<0||c.gear>5) continue;
        if((c.active!=0&&c.active!=1)||(c.ignition!=0&&c.ignition!=1)||(c.starter!=0&&c.starter!=1)||(c.load!=0&&c.load!=1)) continue;
        {std::lock_guard<std::mutex> lock(inputMutex); if(c.sequence>input.sequence) input=c;} inputCondition.notify_one();
    }
    running=false; outputCondition.notify_one(); inputCondition.notify_one();
}
std::vector<int16_t> wave(const std::string &name) {
    std::filesystem::path file(name);
    if(!std::filesystem::exists(file)) {
        for(const auto &entry:std::filesystem::recursive_directory_iterator("../assets")) if(entry.is_regular_file()&&entry.path().filename()==file.filename()) {file=entry.path();break;}
    }
    std::ifstream f(file,std::ios::binary); if(!f) throw std::runtime_error("Impulse response not found: "+name);
    char riff[12]; f.read(riff,12); if(std::string(riff,4)!="RIFF") throw std::runtime_error("Invalid impulse WAV");
    int channels=1,bits=16,rate=44100; std::vector<char> pcm;
    while(f) { char id[4]; std::uint32_t length; f.read(id,4); f.read(reinterpret_cast<char *>(&length),4); if(!f)break; if(length>16*1024*1024)throw std::runtime_error("Impulse WAV too large");
        std::vector<char> data(length); f.read(data.data(),length); if(length%2)f.get();
        if(std::string(id,4)=="fmt "&&length>=16) { channels=*reinterpret_cast<const std::uint16_t *>(data.data()+2); rate=*reinterpret_cast<const std::uint32_t *>(data.data()+4); bits=*reinterpret_cast<const std::uint16_t *>(data.data()+14); }
        if(std::string(id,4)=="data") pcm=std::move(data);
    }
    if(bits!=16||channels<1||rate<8000||pcm.empty())throw std::runtime_error("Unsupported impulse WAV format");
    const auto samples=reinterpret_cast<const int16_t *>(pcm.data()); const size_t frames=pcm.size()/2/channels;
    std::vector<int16_t> result(static_cast<size_t>(frames*44100.0/rate));
    for(size_t i=0;i<result.size();i++) result[i]=samples[std::min(frames-1,static_cast<size_t>(i*rate/44100.0))*channels];
    return result;
}
struct Core {
    Engine *engine=nullptr; Vehicle *vehicle=nullptr; Transmission *transmission=nullptr; Simulator *sim=nullptr;
    bool hostIdle=false;
    double time=0,actualThrottle=0,gasTorque=0,clutchTorque=0,heatKw=0,lastBurnt=0,lastFuel=0,fuelRate=0,frameMs=0;
    double controlMs=0,outputMs=0,monitorMs=0,loopMs=0;
    int focusCylinder=1,preset=0,lastCycleBin=-1;
    std::array<std::array<double,7>,144> cycle{};
    std::array<bool,144> captured{};
    std::array<std::array<std::array<double,7>,144>,6> cylinderCycles{};
    std::array<bool,144> cylinderCaptured{};
    int lastCylinderBin=-1;
    std::uint64_t reset=0;
    ~Core(){release();}
    void release(){if(sim){sim->releaseSimulation();delete sim;sim=nullptr;} if(engine){engine->destroy();delete engine;engine=nullptr;}delete vehicle;vehicle=nullptr;delete transmission;transmission=nullptr;}
    const bool synchronousAudio=[](){const char *v=std::getenv("EP_CORE_SYNCHRONOUS_AUDIO");return v && std::string(v)=="1";}();
    void load(){
        release();
        es_script::Compiler::output()->engine=nullptr; es_script::Compiler::output()->vehicle=nullptr; es_script::Compiler::output()->transmission=nullptr;
        es_script::Compiler compiler; compiler.initialize();
        if(!compiler.compile("../assets/main.mr")){compiler.destroy();throw std::runtime_error("Native engine script failed; see bin/error_log.log");}
        auto output=compiler.execute();engine=output.engine;vehicle=output.vehicle;transmission=output.transmission;compiler.destroy();
        if(!engine||!vehicle||!transmission)throw std::runtime_error("Native script did not create engine, vehicle and transmission");
        sim=engine->createSimulator(vehicle,transmission);
        // Default to the script's reference resolution. Hosted realtime mode is
        // explicitly configured and reported; output audio remains 44.1 kHz.
        int frequency=static_cast<int>(engine->getSimulationFrequency());
        if(const char *mode=std::getenv("EP_CORE_SIMULATION_HZ")) {
            const std::string value(mode);
            if(value!="4000"&&value!="6000"&&value!="8000"&&value!="10000")throw std::runtime_error("EP_CORE_SIMULATION_HZ must be 4000, 6000, 8000 or 10000");
            frequency=std::stoi(value);
        }
        sim->setSimulationFrequency(frequency);
        sim->disableAudioLatencyFeedback();
        engine->calculateDisplacement();
        auto audio=sim->synthesizer().getAudioParameters(); audio.inputSampleNoise=static_cast<float>(engine->getInitialJitter());audio.airNoise=static_cast<float>(engine->getInitialNoise());audio.dF_F_mix=static_cast<float>(engine->getInitialHighFrequencyGain());
        // Opt-in R6 listening candidate: leave headroom BEFORE int16 quantization.
        // The existing output clips on gas transients; reducing a WAV afterwards
        // cannot restore those peaks. Default and hosted behavior stay unchanged.
        const char *r6Headroom=std::getenv("EP_CORE_SOUND_M54_R6_HEADROOM");
        audio.volume=r6Headroom&&std::string(r6Headroom)=="1"?.35f:1.0f;
        sim->synthesizer().setAudioParameters(audio);
        for(int i=0;i<engine->getExhaustSystemCount();i++){auto response=engine->getExhaustSystem(i)->getImpulseResponse();auto pcm=wave(response->getFilename());sim->synthesizer().initializeImpulseResponse(pcm.data(),pcm.size(),response->getVolume(),i);}
        if(!synchronousAudio)sim->startAudioRenderingThread(); time=0;actualThrottle=0;gasTorque=0;clutchTorque=0;heatKw=0;lastBurnt=0;lastFuel=0;fuelRate=0;
        // The desktop synth prefills one second of silence. The local stream has
        // its own jitter buffer; forwarding that prefill creates an old-PCM burst.
        std::vector<int16_t> initialSilence(44100);sim->readAudioOutput(initialSilence.size(),initialSilence.data());
        captured.fill(false);lastCycleBin=-1;
        cylinderCaptured.fill(false);lastCylinderBin=-1;
        publishValveCurves();
        std::cerr<<"Native physical engine loaded. Original gas dynamics + original exhaust synthesizer.\n";
    }
    void publishValveCurves(){
        // Static kinematics: evaluate the actual native cam lobes without moving
        // the simulation. Send once per load rather than in every live frame.
        std::ostringstream o;o<<std::setprecision(7)<<"{\"valveCurves\":{\"samples\":[";
        constexpr int bins=288;
        for(int cylinder=0;cylinder<engine->getCylinderCount();cylinder++){
            if(cylinder)o<<",";o<<"[";
            const auto ch=engine->getChamber(cylinder);const auto head=ch->getCylinderHead();
            const int ci=ch->getPiston()->getCylinderIndex();
            const auto intake=head->getIntakeCamshaft(),exhaust=head->getExhaustCamshaft();
            for(int bin=0;bin<bins;bin++){
                if(bin)o<<",";const double angle=4*3.141592653589793*bin/bins;
                const double il=intake->sampleLobe((-angle+intake->getAdvance())*.5+intake->getLobeCenterline(ci))*1000;
                const double el=exhaust->sampleLobe((-angle+exhaust->getAdvance())*.5+exhaust->getLobeCenterline(ci))*1000;
                o<<"["<<il<<","<<el<<"]";
            }
            o<<"]";
        }
        o<<"]}}";const auto data=o.str();packet(3,data.data(),data.size());
    }
    void publishCylinderCycles(){
        std::ostringstream o;o<<std::setprecision(6)<<"{\"cycles\":[";
        for(int c=0;c<6;c++){
            if(c)o<<",";o<<"{\"cylinder\":"<<c+1<<",\"samples\":[";
            for(int bin=0;bin<144;bin++){
                if(bin)o<<",";if(!cylinderCaptured[bin]){o<<"null";continue;}
                o<<"[";for(int j=0;j<7;j++){if(j)o<<",";o<<cylinderCycles[c][bin][j];}o<<"]";
            }
            o<<"]}";
        }
        o<<"]}";const auto data=o.str();packet(4,data.data(),data.size());
    }
    void controls(Command &c,double dt){
        if(c.reset!=reset){reset=c.reset;load();}
        const bool active=c.active&&wallMs()-c.issued<2500;
        if(!active){c.throttle=0;c.ignition=0;c.starter=0;c.clutch=0;c.load=0;}
        actualThrottle=c.lag==0?c.throttle:c.throttle+(actualThrottle-c.throttle)*std::exp(-dt/c.lag);
        // Small explicitly documented electronic idle controller on the native throttle.
        const double idle=active&&c.ignition&&c.idleAssist?std::clamp(.055+(850-engine->getRpm())*.00008,0.0,.16):0;
        engine->setSpeedControl(std::max(actualThrottle,idle));engine->getIgnitionModule()->m_enabled=active&&c.ignition;
        sim->m_starterMotor.m_enabled=active&&c.starter&&engine->getRpm()<800;
        preset=c.preset;
        if(preset==1)engine->getOutputCrankshaft()->setPlaygroundInertia(.12+c.flywheel);
        if(focusCylinder!=c.focusCylinder){focusCylinder=c.focusCylinder;captured.fill(false);}
        auto audio=sim->synthesizer().getAudioParameters();
        audio.dF_F_mix=c.hf;audio.airNoise=c.noise;audio.inputSampleNoise=c.jitter;audio.convolution=c.convolution;
        sim->synthesizer().setAudioParameters(audio);
        Vehicle::Parameters vp;vp.mass=c.mass;vp.diffRatio=c.finalDrive;vp.tireRadius=c.radius;vp.dragCoefficient=1;vp.crossSectionArea=c.drag;vp.rollingResistance=c.mass*9.81*c.rolling;
        vehicle->playgroundConfigure(vp);vehicle->m_playgroundBrake=7000*c.brake;
        transmission->playgroundRatios(c.gears);transmission->changeGear(c.gear-1);transmission->setClutchPressure(c.clutch);
        sim->m_dyno.m_enabled=active&&c.load;sim->m_dyno.m_hold=false;sim->m_dyno.m_rotationSpeed=0;sim->m_dyno.m_maxTorque=c.loadNm;
    }
    void advance(double dt){
        const auto started=Clock::now();
        // The browser consumes 44,100 PCM samples/s. Its jitter buffer must not
        // accelerate physics to fill the native app's DirectSound latency target.
        sim->startFrame(dt); const int count=sim->getFrameIterationCount(); const double h=sim->getTimestep();
        while(sim->simulateStep()) {
            double torque=0,burnt=0; const double angle=engine->getOutputCrankshaft()->getCycleAngle();
            for(int i=0;i<engine->getCylinderCount();i++) {
                auto chamber=engine->getChamber(i);auto rod=engine->getConnectingRod(i);const auto shaft=rod->getCrankshaft();
                const double r=shaft->getThrow(),l=rod->getLength(),theta=angle-shaft->getRodJournalAngle(rod->getJournal())-shaft->getTdc()+3.141592653589793/2;
                const double derivative=r*std::sin(theta)+r*r*std::sin(theta)*std::cos(theta)/std::sqrt(l*l-r*r*std::sin(theta)*std::sin(theta));
                const double bore=chamber->getCylinderHead()->getCylinderBank()->getBore();
                torque+=(chamber->m_system.pressure()-101325)*3.141592653589793*bore*bore/4*derivative;
                burnt+=chamber->m_nBurntFuel;
            }
            auto selected=engine->getChamber(focusCylinder-1);
            const int bin=std::clamp(static_cast<int>(angle/(4*3.141592653589793)*144),0,143);
            if(bin!=lastCylinderBin){
                for(int c=0;c<6;c++){
                    const auto ch=engine->getChamber(c);const auto head=ch->getCylinderHead();const int ci=ch->getPiston()->getCylinderIndex();
                    cylinderCycles[c][bin]={ch->m_system.pressure()/1000,ch->m_system.temperature(),head->intakeValveLift(ci)*1000,head->exhaustValveLift(ci)*1000,ch->getLastTimestepIntakeFlow()/h,ch->getLastTimestepExhaustFlow()/h,ch->isLit()?1.0:0.0};
                }
                cylinderCaptured[bin]=true;lastCylinderBin=bin;
            }
            if(bin!=lastCycleBin){auto head=selected->getCylinderHead();const int ci=selected->getPiston()->getCylinderIndex();
            cycle[bin]={selected->m_system.pressure()/1000,selected->m_system.temperature(),head->intakeValveLift(ci)*1000,head->exhaustValveLift(ci)*1000,selected->getLastTimestepIntakeFlow()/h,selected->getLastTimestepExhaustFlow()/h,selected->isLit()?1.0:0.0};
            captured[bin]=true;lastCycleBin=bin;}
            gasTorque+=(torque-gasTorque)*h/(.12+h);
            const double transmitted=transmission->playgroundClutchTorque()*(engine->isSpinningCw()?1:-1);
            clutchTorque+=(transmitted-clutchTorque)*h/(.12+h);
            const double release=std::max(0.0,burnt-lastBurnt)/h*engine->getFuel()->getEnergyDensity()/1000;
            heatKw+=(.25*release-heatKw)*h/(.5+h);lastBurnt=burnt;
        }
        sim->endFrame();
        // The bounded headless mode owns all synth buffers on this thread.
        if(synchronousAudio)sim->synthesizer().renderAudio();
        time+=count*h;
        const double fuel=engine->getTotalFuelMassConsumed();
        fuelRate+=(std::max(0.0,fuel-lastFuel)/std::max(h,count*h)*1000-fuelRate)*dt/(.2+dt);lastFuel=fuel;
        frameMs+=.05*(std::chrono::duration<double,std::milli>(Clock::now()-started).count()-frameMs);

    }
    std::string telemetry(const Command &c){
        const double rpm=engine->getRpm(),omega=engine->getSpeed(),ratio=transmission->playgroundRatio()*vehicle->getDiffRatio();
        const double speed=vehicle->getSpeed(),wheelRpm=speed/vehicle->getTireRadius()*60/(2*3.141592653589793);
        const double outputOmega=std::abs(transmission->playgroundOutputOmega());
        const double slip=ratio==0?0:(omega-outputOmega)*60/(2*3.141592653589793);
        const double transmitted=ratio==0||c.clutch==0?0:clutchTorque;
        const double loss=std::abs(transmitted*(omega-outputOmega))/1000;
        std::ostringstream o;o<<std::setprecision(17)<<std::boolalpha;
        o<<"{\"source\":\"ange-physical\",\"schemaVersion\":2,\"simulationHz\":"<<sim->getSimulationFrequency()<<",\"hostIdle\":"<<hostIdle<<",\"processingMs\":"<<frameMs<<",\"timestampMs\":"<<wallMs()<<",\"sequence\":"<<c.sequence<<",\"t\":"<<time<<",\"rpm\":"<<rpm<<",\"omega\":"<<omega<<",\"crankAngle\":"<<engine->getOutputCrankshaft()->getCycleAngle()
         <<",\"hostLoopMs\":"<<loopMs<<",\"controlMs\":"<<controlMs<<",\"outputMs\":"<<outputMs<<",\"monitorMs\":"<<monitorMs
         <<",\"pedal\":"<<c.throttle<<",\"actualThrottle\":"<<engine->getSpeedControl()<<",\"ignition\":"<<engine->getIgnitionModule()->m_enabled<<",\"starter\":"<<sim->m_starterMotor.m_enabled
         <<",\"gear\":"<<(transmission->getGear()+1)<<",\"clutch\":"<<transmission->getClutchPressure()<<",\"speedKmh\":"<<speed*3.6<<",\"velocity\":"<<speed<<",\"wheelRpm\":"<<wheelRpm<<",\"totalRatio\":"<<ratio
         <<",\"torqueNm\":"<<gasTorque<<",\"powerKw\":"<<gasTorque*omega/1000<<",\"wheelTorqueNm\":"<<transmitted*ratio<<",\"dynoNm\":"<<(sim->m_dyno.m_enabled?sim->getFilteredDynoTorque():0)<<",\"slipRpm\":"<<slip<<",\"clutchHeatKw\":"<<loss
         <<",\"clutchState\":\""<<(ratio==0?"neutral":c.clutch==0?"open":std::abs(slip)<10?"locked":"slip")<<"\",\"engineStatus\":\""<<(sim->m_starterMotor.m_enabled?"cranking":engine->getIgnitionModule()->m_enabled?(rpm>150?"running":"stalled"):(rpm>5?"coasting":"stopped"))<<"\""
         <<",\"estimatedHeatKw\":"<<heatKw<<",\"fuelRateGS\":"<<fuelRate<<",\"manifoldKpa\":"<<engine->getManifoldPressure()/1000
         <<",\"geometry\":{\"boreMm\":"<<engine->getCylinderBank(0)->getBore()*1000<<",\"strokeMm\":"<<engine->getOutputCrankshaft()->getThrow()*2000<<",\"rodMm\":"<<engine->getConnectingRod(0)->getLength()*1000<<"},\"cylinders\":[";
        for(int i=0;i<engine->getCylinderCount();i++){if(i)o<<",";auto ch=engine->getChamber(i);auto head=ch->getCylinderHead();auto ci=ch->getPiston()->getCylinderIndex();o<<"{\"pressureKpa\":"<<ch->m_system.pressure()/1000<<",\"gasTemperatureK\":"<<ch->m_system.temperature()<<",\"intakeLiftMm\":"<<head->intakeValveLift(ci)*1000<<",\"exhaustLiftMm\":"<<head->exhaustValveLift(ci)*1000<<",\"fuelFraction\":"<<ch->m_system.mix().p_fuel<<",\"intakeMolS\":"<<ch->getLastTimestepIntakeFlow()/sim->getTimestep()<<",\"exhaustMolS\":"<<ch->getLastTimestepExhaustFlow()/sim->getTimestep()<<",\"burning\":"<<ch->isLit()<<"}";}
        o<<"],\"reference\":"<<(preset==0?"true":"false")<<",\"engineName\":\""<<engine->getName()<<"\",\"tdcRad\":"<<engine->getOutputCrankshaft()->getTdc()<<",\"journalAngles\":[";
        for(int i=0;i<engine->getCylinderCount();i++){if(i)o<<",";auto rod=engine->getConnectingRod(i);o<<rod->getCrankshaft()->getRodJournalAngle(rod->getJournal());}
        o<<"],\"sound\":{\"hfGain\":"<<c.hf<<",\"noise\":"<<c.noise<<",\"jitter\":"<<c.jitter<<",\"convolution\":"<<c.convolution<<"},\"cycle\":{\"cylinder\":"<<focusCylinder<<",\"samples\":[";
        o<<std::setprecision(6);
        for(size_t i=0;i<cycle.size();i++){if(i)o<<",";if(!captured[i]){o<<"null";continue;}o<<"[";for(int j=0;j<7;j++){if(j)o<<",";o<<cycle[i][j];}o<<"]";}
        o<<"]}}";return o.str();
    }
};
int main(int argc,char **argv){
    try {
#if defined(_WIN32)
        // This small realtime process should keep its hot code/data resident,
        // even when other desktop applications create memory pressure.
        SetPriorityClass(GetCurrentProcess(), ABOVE_NORMAL_PRIORITY_CLASS);
        PROCESS_POWER_THROTTLING_STATE qos{};
        qos.Version=PROCESS_POWER_THROTTLING_CURRENT_VERSION;
        qos.ControlMask=PROCESS_POWER_THROTTLING_EXECUTION_SPEED;
        qos.StateMask=0;
        using SetInfo=BOOL(WINAPI*)(HANDLE,PROCESS_INFORMATION_CLASS,LPVOID,DWORD);
        const auto setInfo=reinterpret_cast<SetInfo>(GetProcAddress(GetModuleHandleW(L"kernel32.dll"),"SetProcessInformation"));
        if(setInfo)setInfo(GetCurrentProcess(),ProcessPowerThrottling,&qos,sizeof(qos));
        const bool resident = SetProcessWorkingSetSizeEx(GetCurrentProcess(),32*1024*1024,128*1024*1024,
            QUOTA_LIMITS_HARDWS_MIN_ENABLE|QUOTA_LIMITS_HARDWS_MAX_DISABLE) != 0;
        std::cerr << "Realtime working-set protection: " << (resident?"enabled":"unavailable") << "\n";
#else
        std::cerr << "Realtime pacing: steady clock; operating-system default scheduling.\n";
#endif
        if(const char *flush=std::getenv("EP_CORE_FLUSH_SUBNORMALS"))if(std::string(flush)=="1") {
            // Per-process/thread FP state, inherited by newly created workers.
            // Audio IIR tails below the IEEE normal range must not consume a
            // disproportionate CPU budget. No OS/global scheduling changes.
            _mm_setcsr(_mm_getcsr()|0x8040);
        }
        std::locale::global(std::locale::classic());const bool selfTest=argc>1&&std::string(argv[1])=="--self-test";
        Core core;core.load();
#if defined(_WIN32)
        if(!selfTest){_setmode(_fileno(stdout),_O_BINARY);_setmode(_fileno(stdin),_O_BINARY);}
#endif
        std::thread writer,reader;if(!selfTest){writer=std::thread(outputLoop);reader=std::thread(inputLoop);}
        std::vector<int16_t> samples(8192);std::vector<int16_t> recording;auto next=Clock::now();int frame=0;bool wasResting=false;auto idleTelemetryAt=Clock::now(),idleAudioAt=Clock::now();double silentRemainder=0;double maxRpm=0;RealtimeTimer pacing;
        while(running){
            const auto loopStarted=Clock::now();
            const auto elapsedMs=[](Clock::time_point start){return std::chrono::duration<double,std::milli>(Clock::now()-start).count();};
            Command c;{std::lock_guard<std::mutex>lock(inputMutex);c=input;}
            if(selfTest){c.active=1;c.issued=wallMs();c.ignition=core.time<5;c.starter=core.time<1;c.throttle=core.time>1&&core.time<4?.35:0;}
            bool resting=false;
            try {core.controls(c,.01);core.controlMs+=.05*(elapsedMs(loopStarted)-core.controlMs);resting=!selfTest&&!c.ignition&&!c.starter&&std::abs(core.engine->getRpm())<.1;if(!resting)core.advance(.01);else {core.heatKw=0;core.fuelRate=0;core.gasTorque=0;core.frameMs=0;}core.hostIdle=resting;} catch(const std::exception &e) {std::cerr<<"Native core: "<<e.what()<<"\n";std::_Exit(1);}
            const auto outputStarted=Clock::now();
            maxRpm=std::max(maxRpm,core.engine->getRpm());
            int count=core.sim->readAudioOutput(2048,samples.data());
            const auto audioNow=Clock::now();
            if(resting&&count==0){
                if(!wasResting){idleAudioAt=audioNow-std::chrono::milliseconds(10);silentRemainder=0;}
                const double exact=std::chrono::duration<double>(audioNow-idleAudioAt).count()*44100+silentRemainder;
                count=std::clamp(static_cast<int>(exact),0,static_cast<int>(samples.size()));
                silentRemainder=exact-std::floor(exact);
                std::fill(samples.begin(),samples.begin()+count,0);
            }
            idleAudioAt=audioNow;
            if(count>0){if(selfTest)recording.insert(recording.end(),samples.begin(),samples.begin()+count);else packet(2,samples.data(),count*sizeof(int16_t));}
            core.outputMs+=.05*(elapsedMs(outputStarted)-core.outputMs);
            const auto monitorStarted=Clock::now();
            const bool sendState=resting?(Clock::now()>=idleTelemetryAt||!wasResting):frame%3==0;
            if(sendState)idleTelemetryAt=Clock::now()+std::chrono::milliseconds(200);
            ++frame;
            if(sendState){auto state=core.telemetry(c);if(selfTest){if(frame%99==1)std::cout<<state<<"\n";}else packet(1,state.data(),state.size());}
            if(!selfTest&&(resting?!wasResting:frame%25==1))core.publishCylinderCycles();
            wasResting=resting;
            core.monitorMs+=.05*(elapsedMs(monitorStarted)-core.monitorMs);
            core.loopMs+=.05*(elapsedMs(loopStarted)-core.loopMs);
            if(selfTest&&core.time>=6)break;
            if(resting){
                // Wake immediately on input; unchanged idle state needs only a 20 Hz tick.
                std::unique_lock<std::mutex> lock(inputMutex);
                inputCondition.wait_for(lock,std::chrono::milliseconds(50),[&]{return !running||input.sequence!=c.sequence;});
                next=Clock::now();
                continue;
            }
            // Recover short host scheduling stalls without throwing away motor
            // time (and therefore PCM). Stop/control leases still use wall time.
            next+=std::chrono::milliseconds(10);if(next<Clock::now()-std::chrono::milliseconds(1500))next=Clock::now();pacing.wait(next);
        }
        running=false;outputCondition.notify_one();if(reader.joinable())reader.join();if(writer.joinable())writer.join();
        if(selfTest){std::ofstream f("self-test.pcm",std::ios::binary);f.write(reinterpret_cast<const char *>(recording.data()),recording.size()*2);std::cout<<"SELF_TEST max_rpm="<<maxRpm<<" pcm_samples="<<recording.size()<<"\n";if(maxRpm<500||recording.size()<44100)return 2;}
        return 0;
    }catch(const std::exception &e){std::cerr<<e.what()<<"\n";return 1;}
}
