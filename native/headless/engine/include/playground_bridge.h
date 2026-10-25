#pragma once

#include <atomic>
#include <cstdint>
#include <filesystem>
#include <mutex>
#include <string>
#include <thread>

// No Engine/Simulator pointers cross the boundary. The I/O thread only sees copies.
struct PlaygroundCommand {
    std::uint64_t sequence = 0, resetId = 0;
    double issuedAtMs = 0, throttle = 0, clutch = 0, holdRpm = 3000, volume = 0.08;
    int gear = 0;
    bool valid = false, active = false, ignition = false, starter = false, dyno = false;
};
struct PlaygroundTelemetry {
    std::uint64_t sequence = 0, appliedSequence = 0;
    double timestampMs = 0, simTimeS = 0, rpm = 0, crankAngle = 0, throttle = 0, actualThrottle = 0;
    double clutch = 0, speedMs = 0, dynoTorqueNm = 0;
    double boreMm = 84, strokeMm = 89.6, rodMm = 135;
    int gear = 0, cylinderCount = 6;
    bool ignition = false, starter = false, dynoEnabled = false;
    std::string engineName;
};

class PlaygroundBridge {
public:
    PlaygroundBridge();
    ~PlaygroundBridge();
    PlaygroundBridge(const PlaygroundBridge &) = delete;
    PlaygroundBridge &operator=(const PlaygroundBridge &) = delete;
    bool enabled() const { return m_enabled; }
    PlaygroundCommand command();
    void publish(PlaygroundTelemetry value);
    void stop();
private:
    void ioLoop();
    const bool m_enabled;
    std::filesystem::path m_directory;
    std::atomic<bool> m_stopping{false};
    std::thread m_thread;
    std::mutex m_mutex;
    PlaygroundCommand m_command;
    PlaygroundTelemetry m_telemetry;
    std::uint64_t m_nextSequence = 0;
};
