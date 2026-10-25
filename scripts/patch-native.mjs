import { readFile, writeFile, copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = resolve(project, 'native/source');
const source = process.argv[2] ? resolve(process.argv[2]) : null;
async function copyTree(from, to) {
  await mkdir(to, { recursive: true });
  for (const item of await readdir(from, { withFileTypes: true })) {
    if (item.name === '.git' || item.name === 'build') continue;
    if (item.isDirectory()) await copyTree(resolve(from, item.name), resolve(to, item.name));
    else if (item.isFile()) await copyFile(resolve(from, item.name), resolve(to, item.name));
  }
}
if (source) {
  try { await stat(resolve(destination, 'README.md')); throw new Error('native/source exists. Use the existing prepared snapshot.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await copyTree(source, destination);
}
const headerFile = resolve(destination, 'include/engine_sim_application.h');
const cppFile = resolve(destination, 'src/engine_sim_application.cpp');
const cmakeFile = resolve(destination, 'CMakeLists.txt');
let header = await readFile(headerFile, 'utf8'), cpp = await readFile(cppFile, 'utf8'), cmake = await readFile(cmakeFile, 'utf8');
if (header.includes('PlaygroundBridge m_playground')) { console.log('Native patch already applied.'); process.exit(0); }
function replaceOnce(text, needle, replacement) {
  if (text.split(needle).length !== 2) throw new Error(`Upstream anchor is not unique: ${needle.slice(0, 60)}`);
  return text.replace(needle, replacement);
}
header = replaceOnce(header, '#include <vector>', '#include <vector>\n#include "playground_bridge.h"');
header = replaceOnce(header, '        void processEngineInput();', '        void processEngineInput();\n        void applyPlaygroundInput();\n        void publishPlaygroundState(int iterations);');
header = replaceOnce(header, '        double m_dynoSpeed;', '        double m_dynoSpeed;\n        PlaygroundBridge m_playground;\n        double m_playgroundTime = 0;\n        std::uint64_t m_playgroundReset = 0;\n        std::uint64_t m_playgroundApplied = 0;');
cpp = replaceOnce(cpp, '        processEngineInput();', '        processEngineInput();\n        applyPlaygroundInput();');
cpp = replaceOnce(cpp, '    m_simulator->endFrame();', '    m_simulator->endFrame();\n    publishPlaygroundState(iterationCount);');
cpp = replaceOnce(cpp, '    m_audioSource->SetVolume(1.0f);', '    m_audioSource->SetVolume(0.08f);');
cpp = replaceOnce(cpp, 'void EngineSimApplication::destroy() {', 'void EngineSimApplication::destroy() {\n    m_playground.stop();');
cpp = replaceOnce(cpp, '    m_simulator->setSimulationSpeed(speed);', '    if (m_playground.enabled()) speed = 1.0;\n    m_simulator->setSimulationSpeed(speed);');
cpp = replaceOnce(cpp, 'compiler.compile("../assets/main.mr")', 'compiler.compile(m_assetPath + "/main.mr")');
cpp += `
// Engine Playground extension: validated inputs at frame boundaries only.
void EngineSimApplication::applyPlaygroundInput() {
    if (!m_playground.enabled() || m_iceEngine == nullptr || m_simulator == nullptr) return;
    const PlaygroundCommand c = m_playground.command();
    if (c.valid && c.resetId != m_playgroundReset) {
        m_playgroundReset = c.resetId;
        m_audioSource->SetMode(ysAudioSource::Mode::Stop);
        loadScript();
        m_playgroundTime = 0;
        if (m_iceEngine == nullptr || m_simulator == nullptr) return;
        m_audioSource->SetMode(ysAudioSource::Mode::Loop);
    }
    const bool active = c.valid && c.active;
    m_targetSpeedSetting = m_speedSetting = active ? c.throttle : 0;
    m_iceEngine->setSpeedControl(m_speedSetting);
    m_iceEngine->getIgnitionModule()->m_enabled = active && c.ignition;
    m_simulator->m_starterMotor.m_enabled = active && c.starter;
    m_targetClutchPressure = m_clutchPressure = active ? c.clutch : 0;
    m_transmission->setClutchPressure(m_clutchPressure);
    if (active) m_transmission->changeGear(c.gear - 1);
    m_simulator->m_dyno.m_enabled = active && c.dyno;
    m_simulator->m_dyno.m_hold = active && c.dyno;
    m_dynoSpeed = units::rpm(c.holdRpm);
    m_simulator->m_dyno.m_rotationSpeed = m_dynoSpeed;
    m_audioSource->SetVolume(static_cast<float>(active ? c.volume : 0));
    if (c.valid) m_playgroundApplied = c.sequence;
}
void EngineSimApplication::publishPlaygroundState(int iterations) {
    if (!m_playground.enabled() || m_iceEngine == nullptr || m_simulator == nullptr) return;
    m_playgroundTime += iterations * m_simulator->getTimestep();
    PlaygroundTelemetry s;
    s.appliedSequence = m_playgroundApplied;
    s.simTimeS = m_playgroundTime;
    s.rpm = m_iceEngine->getRpm();
    s.crankAngle = m_iceEngine->getOutputCrankshaft()->getCycleAngle();
    s.throttle = m_iceEngine->getSpeedControl();
    s.actualThrottle = 1.0 - m_iceEngine->getThrottle();
    s.ignition = m_iceEngine->getIgnitionModule()->m_enabled;
    s.starter = m_simulator->m_starterMotor.m_enabled;
    s.gear = m_transmission->getGear() + 1;
    s.clutch = m_transmission->getClutchPressure();
    s.speedMs = m_vehicle->getSpeed();
    s.dynoEnabled = m_simulator->m_dyno.m_enabled;
    s.dynoTorqueNm = m_simulator->getFilteredDynoTorque();
    s.cylinderCount = m_iceEngine->getCylinderCount();
    s.boreMm = m_iceEngine->getCylinderBank(0)->getBore() * 1000;
    s.strokeMm = m_iceEngine->getOutputCrankshaft()->getThrow() * 2000;
    s.rodMm = m_iceEngine->getConnectingRod(0)->getLength() * 1000;
    s.engineName = m_iceEngine->getName();
    m_playground.publish(std::move(s));
}
`;
cmake = replaceOnce(cmake, 'add_executable(engine-sim-app WIN32', 'add_executable(engine-sim-app WIN32\n    src/playground_bridge.cpp\n    include/playground_bridge.h');
await copyFile(resolve(project, 'native/playground_bridge.h'), resolve(destination, 'include/playground_bridge.h'));
await copyFile(resolve(project, 'native/playground_bridge.cpp'), resolve(destination, 'src/playground_bridge.cpp'));
await writeFile(headerFile, header); await writeFile(cppFile, cpp); await writeFile(cmakeFile, cmake);

let preset = await readFile(resolve(destination, 'assets/engines/bmw/M52B28.mr'), 'utf8');
preset = preset.replace(/\r\n/g, '\n')
  .replaceAll('bmw_distributor', 'pg_distributor').replaceAll('bmw_camshaft_builder', 'pg_camshaft_builder').replaceAll('bmw_m52b28_head', 'pg_head')
  .replaceAll('m52b28_lobe_profile', 'pg_lobe_profile').replaceAll('M52B28', 'playground_i6')
  .replace('name: "BMW playground_i6"', 'name: "Playground I6 - native educational preset"')
  .replace('throw: 84 * units.mm / 2', 'throw: 89.6 * units.mm / 2')
  .replace('moment_of_inertia: 0.22986844776863666 * 0.9', 'moment_of_inertia: 0.30')
  .replace('tdc: 120.0 * units.deg', 'tdc: 90.0 * units.deg')
  .replace('deck_height: (210.0 + 1) * units.mm', 'deck_height: (89.6 / 2 + 135.0 + 31.82) * units.mm')
  .replace('input chamber_volume: 34.0 * units.cc', 'input chamber_volume: 50.0 * units.cc')
  .replace('rev_limit: 8000 * units.rpm', 'rev_limit: 6800 * units.rpm');
preset = '// Derived from Ange Yaghi engine-sim, MIT license. Modified for Engine Playground.\n// Own learning preset; no original BMW measurements or guaranteed sound fidelity.\n' + preset;
preset += `
private node pg_vehicle {
    alias output __out: vehicle(mass: 1450 * units.kg, drag_coefficient: 0.3,
        cross_sectional_area: 2.1666667 * units.m2, diff_ratio: 3.15,
        tire_radius: 0.31 * units.m, rolling_resistance: 0.012 * 1450 * 9.81);
}
private node pg_transmission {
    alias output __out: transmission(max_clutch_torque: 420 * units.Nm)
        .add_gear(4.2).add_gear(2.5).add_gear(1.65).add_gear(1.2).add_gear(1.0);
}
public node main {
    set_engine(playground_i6())
    set_vehicle(pg_vehicle())
    set_transmission(pg_transmission())
}
`;
await mkdir(resolve(destination, 'assets/engines/playground'), { recursive: true });
await writeFile(resolve(destination, 'assets/engines/playground/i6_3l.mr'), preset);
await writeFile(resolve(destination, 'assets/main.mr'), 'import "engine_sim.mr"\nimport "themes/default.mr"\nimport "engines/playground/i6_3l.mr"\nuse_default_theme()\nmain()\n');
console.log('Native source snapshot staged, bridge patch applied. Compilation is a separate required step.');
