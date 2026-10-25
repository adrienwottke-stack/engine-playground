#include "playground_bridge.h"

#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <Windows.h>
#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdlib>
#include <fstream>
#include <iomanip>
#include <locale>
#include <sstream>
#include <stdexcept>

namespace {
double clockMs() {
    return std::chrono::duration<double, std::milli>(std::chrono::system_clock::now().time_since_epoch()).count();
}
bool finiteRange(double value, double lo, double hi) { return std::isfinite(value) && value >= lo && value <= hi; }
std::string escaped(const std::string &value) {
    std::ostringstream out;
    for (const unsigned char c : value.substr(0, 120)) {
        if (c == '"' || c == '\\') out << '\\' << static_cast<char>(c);
        else if (c >= 32) out << static_cast<char>(c);
    }
    return out.str();
}
bool parseCommand(const std::filesystem::path &file, PlaygroundCommand &command) {
    std::ifstream stream(file);
    stream.imbue(std::locale::classic());
    std::string line;
    if (!std::getline(stream, line) || line.size() > 1024) return false;
    std::istringstream input(line);
    input.imbue(std::locale::classic());
    PlaygroundCommand c;
    int active, ignition, starter, dyno;
    if (!(input >> c.sequence >> c.issuedAtMs >> active >> c.throttle >> ignition >> starter >> c.gear >> c.clutch >> dyno >> c.holdRpm >> c.volume >> c.resetId)) return false;
    std::string extra;
    if (input >> extra) return false;
    if ((active != 0 && active != 1) || (ignition != 0 && ignition != 1) || (starter != 0 && starter != 1) || (dyno != 0 && dyno != 1)) return false;
    if (!finiteRange(c.throttle, 0, 1) || !finiteRange(c.clutch, 0, 1) || !finiteRange(c.volume, 0, 0.35) || !finiteRange(c.holdRpm, 1000, 6500) || c.gear < 0 || c.gear > 5) return false;
    if (!finiteRange(c.issuedAtMs, clockMs() - 2000, clockMs() + 1000)) return false;
    c.active = active != 0; c.ignition = ignition != 0; c.starter = starter != 0; c.dyno = dyno != 0; c.valid = true;
    if (!c.active) { c.throttle = 0; c.ignition = false; c.starter = false; c.volume = 0; }
    command = c;
    return true;
}
std::string serialize(const PlaygroundTelemetry &s) {
    std::ostringstream o;
    o.imbue(std::locale::classic());
    o << std::setprecision(17) << std::boolalpha;
    o << "{\"schemaVersion\":1,\"source\":\"engine-sim-original\",\"timestampMs\":" << s.timestampMs
      << ",\"sequence\":" << s.sequence << ",\"appliedSequence\":" << s.appliedSequence
      << ",\"simTimeS\":" << s.simTimeS << ",\"rpm\":" << s.rpm << ",\"crankAngle\":" << s.crankAngle
      << ",\"throttle\":" << s.throttle << ",\"actualThrottle\":" << s.actualThrottle
      << ",\"ignition\":" << s.ignition << ",\"starter\":" << s.starter
      << ",\"gear\":" << s.gear << ",\"clutch\":" << s.clutch << ",\"speedMs\":" << s.speedMs
      << ",\"dynoEnabled\":" << s.dynoEnabled << ",\"dynoTorqueNm\":";
    if (s.dynoEnabled && std::isfinite(s.dynoTorqueNm)) o << s.dynoTorqueNm;
    else o << "null";
    o << ",\"geometry\":{\"cylinderCount\":" << s.cylinderCount << ",\"boreMm\":" << s.boreMm
      << ",\"strokeMm\":" << s.strokeMm << ",\"rodMm\":" << s.rodMm << "},\"engineName\":\"" << escaped(s.engineName) << "\"}";
    return o.str();
}
}

PlaygroundBridge::PlaygroundBridge() : m_enabled(std::getenv("ENGINE_PLAYGROUND_MAILBOX") != nullptr && std::getenv("ENGINE_PLAYGROUND_MAILBOX")[0] != '\0') {
    if (m_enabled) {
        m_directory = std::filesystem::u8path(std::getenv("ENGINE_PLAYGROUND_MAILBOX"));
        m_thread = std::thread(&PlaygroundBridge::ioLoop, this);
    }
}
PlaygroundBridge::~PlaygroundBridge() { stop(); }
void PlaygroundBridge::stop() { m_stopping.store(true); if (m_thread.joinable()) m_thread.join(); }
PlaygroundCommand PlaygroundBridge::command() {
    std::lock_guard<std::mutex> lock(m_mutex);
    PlaygroundCommand c = m_command;
    if (clockMs() - c.issuedAtMs > 2000) { c.valid = false; c.active = false; c.ignition = false; c.starter = false; c.throttle = 0; c.volume = 0; }
    return c;
}
void PlaygroundBridge::publish(PlaygroundTelemetry value) {
    if (!m_enabled) return;
    value.timestampMs = clockMs();
    value.sequence = ++m_nextSequence;
    std::lock_guard<std::mutex> lock(m_mutex);
    m_telemetry = std::move(value);
}
void PlaygroundBridge::ioLoop() {
    std::uint64_t lastWritten = 0, lastRead = 0;
    while (!m_stopping.load()) {
        try {
            std::filesystem::create_directories(m_directory);
            PlaygroundCommand next;
            if (parseCommand(m_directory / "command.txt", next) && next.sequence > lastRead) {
                std::lock_guard<std::mutex> lock(m_mutex);
                m_command = next;
                lastRead = next.sequence;
            }
            PlaygroundTelemetry state;
            { std::lock_guard<std::mutex> lock(m_mutex); state = m_telemetry; }
            if (state.sequence > lastWritten) {
                const auto temp = m_directory / "telemetry.tmp";
                { std::ofstream file(temp, std::ios::binary | std::ios::trunc); file << serialize(state); file.flush(); if (!file) throw std::runtime_error("telemetry write failed"); }
                const auto target = m_directory / "telemetry.json";
                if (MoveFileExW(temp.c_str(), target.c_str(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) lastWritten = state.sequence;
            }
        } catch (...) { /* An I/O outage never blocks the simulation or audio threads. Watchdogs expose it. */ }
        std::this_thread::sleep_for(std::chrono::milliseconds(33));
    }
}
