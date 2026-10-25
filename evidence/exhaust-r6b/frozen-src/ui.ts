export const icons = {
  engine: '<path d="M4 9h3V6h10v3h3v9H4V9Z"/><path d="M8 3h8M12 3v3M1 12h3M20 12h3M8 11v4m4-4v4m4-4v4"/>',
  gear: '<path d="m9 3 1 3h4l1-3 3 2-1 3 2 3 3 1v3l-3 1-2 3 1 3-3 2-1-3h-4l-1 3-3-2 1-3-2-3-3-1v-3l3-1 2-3-1-3 3-2Z"/><circle cx="12" cy="13" r="3"/>',
  cooling: '<path d="M12 2s-7 8-7 13a7 7 0 0 0 14 0C19 10 12 2 12 2Z"/><path d="M8 16a4 4 0 0 0 4 4"/>',
  experiment: '<path d="M9 3h6M10 3v6L4 19a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3L14 9V3M7 15h10"/>',
  model: '<path d="M4 3h6a3 3 0 0 1 3 3v16a4 4 0 0 0-4-3H4V3Zm16 0h-4a3 3 0 0 0-3 3v16a4 4 0 0 1 4-3h3V3Z"/>',
  sound: '<path d="M3 9v6h4l5 4V5L7 9H3Zm13-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  play: '<path d="m7 4 14 8-14 8V4Z"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="1"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 9M3 3v7h7"/>',
  export: '<path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>'
};
export const icon = (name: keyof typeof icons, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;

const setting = (name: string, path: string, value: number, min: number, max: number, step: number, unit: string, live = false) => `
  <label class="setting"><span class="setting-top"><span>${name}</span><output data-output="${path}">${String(value).replace('.', ',')} ${unit}</output></span>
  <input type="range" data-cfg="${path}" ${live ? 'data-live="true"' : ''} min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${name}" data-unit="${unit}" /></label>`;

export const markup = `
<header class="topbar">
  <a class="brand" href="#mechanics" aria-label="Engine Playground – Mechanik"><span class="brand-mark">${icon('engine', 26)}</span><span>ENGINE<span class="brand-bottom">PLAYGROUND</span></span></a>
  <div class="header-center"><span class="local-dot"></span> DEINE LOKALE GARAGE <span class="header-divider">/</span><span class="build-number">I6–001</span></div>
  <div class="header-actions">
    <label class="backend-control" hidden><span class="sr-only">Backend-Modus</span><select id="backend" aria-label="Backend-Modus"><option value="core">Ange · Physischer Motor</option><option value="demo">Demo · Lernmodell</option></select></label>
    <button class="icon-button" id="mute" aria-label="Ton stummschalten" aria-pressed="false" title="Ton stummschalten">${icon('sound')}</button>
  </div>
</header>
<div class="shell">
  <nav class="side-nav" aria-label="Werkstattbereiche">
    <button data-tab="mechanics" class="nav-button active" aria-current="page">${icon('engine', 23)}<span>Mechanik</span></button>
    <button data-tab="gearing" class="nav-button">${icon('gear', 23)}<span>Antrieb</span></button>
    <button data-tab="cooling" class="nav-button">${icon('cooling', 23)}<span>Kühlung</span></button>
    <button data-tab="experiments" class="nav-button">${icon('experiment', 23)}<span>Versuche</span></button>
    <button data-tab="model" class="nav-button nav-model">${icon('model', 23)}<span>Modell</span></button>
    <div class="nav-foot">LOKAL<br><span>v0.2</span></div>
  </nav>
  <main class="workspace">
    <div class="page-heading"><div><p class="eyebrow" id="eyebrow">WERKBANK / MECHANIK</p><h1 id="page-title">Ein Reihensechser. Deine Regeln.</h1><p class="page-subtitle" id="page-subtitle">Gas geben, zuhören, verstehen. Ein 3,0-Liter-Lernmodell zum Experimentieren.</p></div><span class="connection-pill" id="connection" role="status"><i></i>Demo</span></div>
    <div class="mode-note" id="mode-note">Vereinfachte Simulation · synthetischer Motorsound · keine Messdaten eines BMW</div>
    <section class="readings" aria-label="Live-Messwerte">
      <div class="rpm-reading"><span class="reading-label">MOTORDREHZAHL</span><div><strong id="rpm" data-testid="rpm">0</strong><span class="reading-unit">1/min</span></div><div class="rpm-bar"><span id="rpm-bar"></span><i></i></div></div>
      <div class="reading"><span class="reading-label">MOTORDREHMOMENT</span><div><strong id="torque">0</strong><span>Nm</span></div><small id="torque-kind">Lernmodell · an der Welle</small></div>
      <div class="reading"><span class="reading-label">MECHANISCHE LEISTUNG</span><div><strong id="power">0,0</strong><span>kW</span></div><small>P = M × 2π × n / 60</small></div>
      <div class="reading"><span class="reading-label">FAHRZEUG</span><div><strong id="speed">0,0</strong><span>km/h</span></div><small id="gear-readout">Neutral · entkoppelt</small></div>
    </section>
    <div class="workshop">
      <div class="main-column">
        <section class="section-page" data-page="mechanics">
          <article class="panel engine-panel">
            <div class="panel-heading"><div><span class="panel-kicker">SCHNITTANSICHT</span><h2 id="engine-name">Playground I6 <span>3,0 L</span></h2></div><div class="engine-live"><span class="engine-dot" id="engine-dot"></span><span id="engine-status">Motor aus</span></div></div>
            <div class="cutaway-toolbar"><span class="engine-layout-label">6 ZYLINDER IN REIHE <span>1–5–3–6–2–4</span></span><div hidden class="segmented" aria-label="Schnittansicht wählen"><button id="view-detail" class="active" aria-pressed="true">Zylinder im Detail</button><button id="view-overview" aria-pressed="false">Alle sechs</button></div><label hidden>Zylinder <select id="focus-cylinder" aria-label="Zylinder im Detail">${[1,2,3,4,5,6].map(i => `<option>${i}</option>`).join('')}</select></label></div>
            <canvas id="engine-canvas" aria-label="Motorschnitt mit Ansaugtrakt, Einspritzung, Ventilen, Verbrennung, Abgas und Kühlmantel" role="img"></canvas>
            <div class="flow-legend"><span><i class="air"></i>Ansaugluft</span><span><i class="fuel"></i>Kraftstoff</span><span><i class="exhaust"></i>Abgas</span><span><i class="water"></i>Kühlmittel</span></div>
            <div class="cylinder-readings"><span>TAKT <b id="cylinder-stage">—</b></span><span>ZYLINDERDRUCK · LIVE <b id="cylinder-pressure">—</b></span><span>SAUGROHR · LIVE <b id="manifold-pressure">—</b></span></div>
            <div class="engine-spec"><span>BOHRUNG <b id="bore-spec">84 mm</b></span><span>HUB <b id="stroke-spec">89,6 mm</b></span><span>PLEUEL <b id="rod-spec">135 mm</b></span><span>ZÜNDFOLGE <b>1–5–3–6–2–4</b></span></div>
            <div class="view-controls"><label class="check-control"><input type="checkbox" id="slow" /> <span>Zyklus in Zeitlupe</span></label><span class="view-note">Flüsse schematisch · Motor & Ton laufen in Echtzeit</span></div>
          </article>
          <article class="panel chart-panel"><div class="panel-heading"><div><span class="panel-kicker">DEIN LAUF</span><h2>Was sich gerade verändert</h2></div><select id="live-metric" aria-label="Größe im Live-Diagramm"><option value="rpm">Drehzahl</option><option value="torque">Drehmoment & Last</option><option value="temperature">Temperaturen</option></select></div><div id="live-legend" class="chart-legend"><span><i style="background:var(--teal)"></i>Motor · 1/min</span></div><canvas id="live-chart" aria-label="Zeitverlauf der ausgewählten Live-Messwerte" role="img"></canvas><div class="chart-footer"><span id="sim-clock">0,0 s Simulationszeit</span><button class="text-button" id="csv-export">${icon('export', 16)} CSV exportieren</button></div></article>
        </section>
        <section class="section-page" data-page="gearing" hidden>
          <article class="panel"><div class="panel-heading"><div><span class="panel-kicker">KRAFTFLUSS</span><h2>Von der Kurbelwelle zum Rad</h2></div><span class="mini-tag" id="clutch-state">Neutral</span></div>
            <canvas id="drive-canvas" role="img" aria-label="Bewegter Antrieb mit Schwungrad, Kupplung, Getriebe und Rad"></canvas>
            <div class="drivetrain-diagram"><div>${icon('engine', 38)}<strong id="drive-rpm">0</strong><span>Motor · 1/min</span></div><span class="drive-line"></span><div class="clutch-symbol"><span id="drive-ratio">N</span><small>Gesamtübersetzung</small></div><span class="drive-line"></span><div class="wheel-symbol"><span>◉</span><strong id="wheel-rpm">0</strong><small>Rad · 1/min</small></div></div>
            <div class="info-grid"><div><span>Raddrehmoment</span><strong id="wheel-torque">0 Nm</strong></div><div><span>Kupplungsschlupf</span><strong id="slip-rpm">0 1/min</strong></div><div><span>Schlupfverlust</span><strong id="clutch-heat">0,0 kW</strong></div></div>
            <p class="panel-note" id="kinematics">In Neutral ist der Motor vom Fahrzeug getrennt.</p>
          </article>
          <article class="panel"><div class="panel-heading"><div><span class="panel-kicker">BAUTEILE VERÄNDERN</span><h2>Motor & Antrieb</h2></div><span class="mini-tag">Antrieb wirkt sofort</span></div><p class="panel-note">Teste im ersten Gang mit geschlossener Kupplung. Mehr Masse bremst das Beschleunigen; eine kurze Übersetzung erhöht das Raddrehmoment. Die Motorgeometrie entspricht dem gewählten M52B28 und bleibt fest.</p>
          <fieldset class="settings-grid" id="mechanical-settings">
          ${setting('Schwungrad-Trägheit', 'engine.flywheelKgM2', 0.18, 0.04, 1, 0.01, 'kg·m²')}
          ${setting('Gasverzögerung · optional', 'engine.throttleLagS', 0, 0, 2, 0.05, 's')}
          ${setting('Bohrung', 'engine.boreMm', 84, 70, 100, 1, 'mm')}
          ${setting('Hub', 'engine.strokeMm', 89.6, 60, 105, 0.1, 'mm')}
          ${setting('Pleuellänge', 'engine.rodMm', 135, 110, 170, 1, 'mm')}
          ${setting('Fahrzeugmasse', 'vehicle.massKg', 1450, 400, 3000, 25, 'kg')}
          ${setting('Achsübersetzung', 'vehicle.finalDrive', 3.15, 2, 5, 0.05, '')}
          ${setting('Wirksamer Radradius', 'vehicle.wheelRadiusM', 0.31, 0.2, 0.45, 0.01, 'm')}
          ${setting('Luftwiderstandsfläche c_w × A', 'vehicle.dragAreaM2', 0.65, 0, 1.5, 0.05, 'm²')}
          ${setting('Rollwiderstandsbeiwert', 'vehicle.rollingCoefficient', 0.012, 0, 0.04, 0.001, '')}
          <div class="gear-settings">${[4.2, 2.5, 1.65, 1.2, 1].map((v, i) => `<label>Gang ${i + 1}<input type="number" aria-label="Übersetzung Gang ${i + 1}" data-cfg="vehicle.gears.${i}" value="${v}" min="0.5" max="5" step="0.05" /></label>`).join('')}</div>
          </fieldset><div class="panel-bottom"><p id="config-feedback">Fahrzeug und Übersetzungen werden während des Laufs übernommen. Motorgeometrie und Schwungrad bleiben beim Originalwert.</p><button hidden class="primary-button" id="mechanical-apply">Geometrie übernehmen</button></div></article>
        </section>
        <section class="section-page" data-page="cooling" hidden>
          <article class="panel"><div class="panel-heading"><div><span class="panel-kicker">DER KÜHLKREIS IN BEWEGUNG</span><h2>Wohin die Wärme geht</h2></div><span class="mini-tag">Thermisches Lernmodell</span></div><div class="thermal-toolbar"><button id="warm-cooling" class="secondary-button">Warm testen · 95 °C</button><button id="cold-cooling" class="text-button">Kalt starten</button><label class="check-control cooling-slow-control" title="Nur die Zeichnung wird langsamer; Motor und Ton laufen in Echtzeit."><input type="checkbox" id="cooling-slow" /><span>Motor in Zeitlupe</span></label><label>Wärme-Zeitraffer <select id="thermal-rate" aria-label="Wärme-Zeitraffer"><option value="1">1×</option><option value="10">10×</option><option value="30">30×</option></select></label></div><div class="cooling-live-status"><strong id="cooling-status" role="status" data-status="cold">Kaltlauf</strong><span id="thermostat-state">Thermostat 0 % offen</span><span id="radiator-flow">Kühlerzweig 0 L/min</span><span id="fan-state">Lüfter Auto · 0 %</span></div><p class="thermal-alert" id="thermal-alert" role="status" hidden></p><canvas id="cooling-canvas" role="img" aria-label="Animierter Kühlkreis mit Pumpe, Kühlmantel, Rücklauf, Kühler und Lüfter"></canvas><div class="info-grid"><div><span>Wärmeeintrag · angenommen</span><strong id="heat-in">0,0 kW</strong></div><div><span>Wärme an die Umgebung</span><strong id="heat-out">0,0 kW</strong></div><div><span>Änderung pro simulierter Minute</span><strong id="thermal-slope">0,00 °C/min</strong></div></div><p class="panel-note" id="thermal-feedback">Kalt haben Pumpe und Lüfter zunächst wenig Wärme zu transportieren. „Warm testen“ macht ihren Einfluss sofort sichtbar.</p><div class="thermal-clock"><span id="thermal-clock">0 s Wärmeverlauf · 1×</span><span>Bilanz: <b id="energy-error">0 J</b></span></div></article>
          <article class="panel chart-panel"><div class="panel-heading"><h2>Temperaturen & Wärmeleistung</h2><select id="thermal-metric" aria-label="Größe im Kühlungsdiagramm"><option value="temperature">Temperaturen · °C</option><option value="heat">Wärmeleistung · kW</option></select></div><div class="chart-legend" id="thermal-legend"></div><canvas id="thermal-chart" role="img" aria-label="Temperatur- oder Wärmeleistungsverläufe"></canvas></article>
          <article class="panel"><div class="panel-heading"><div><span class="panel-kicker">KÜHLKREIS ABSTIMMEN</span><h2>Kühlung, die sich entwickelt</h2></div></div>
            <div class="settings-grid">
              ${setting('Umgebungstemperatur', 'cooling.ambientC', 22, -10, 45, 1, '°C', true)}
              ${setting('Pumpen-Durchfluss', 'cooling.flowLMin', 45, 0, 100, 1, 'L/min', true)}
              ${setting('Kühler-Wärmeübergang UA', 'cooling.radiatorWPerK', 1200, 0, 3000, 25, 'W/K', true)}
              ${setting('Lüfterstufe', 'cooling.fan', 1, 0, 3, 1, '', true)}<p class="fan-mode-help">0 aus · 1 automatisch · 2 Dauerlauf 65 % · 3 volle Leistung</p>
              <label class="select-setting">Wärmeeintrag<select id="heat-mode" data-cfg="cooling.heatMode"><option value="estimated">Angenommen aus Motorbetrieb</option><option value="manual">Konstant · auch bei Motor aus</option></select></label>
              ${setting('Konstanter Wärmeeintrag', 'cooling.manualHeatKw', 25, 0, 100, 1, 'kW', true)}
              <label class="check-control"><input type="checkbox" id="road-air" data-cfg="cooling.roadAir" checked /> Fahrtwind aus Fahrzeuggeschwindigkeit</label>
            </div><p class="panel-note" id="heat-assumption">Motorbetrieb: 6 kW Grundwärme + 0,65 × angenommene innere Leistung + 9 kW × Drossel. Diese Annahme ist keine Messung der Wärmeleistung.</p>
            <details class="capacity-details"><summary>Wärmespeicher ändern · Kühlkreis neu initialisieren</summary><div class="settings-grid">
              ${setting('Kühlmittelmenge', 'cooling.coolantL', 9, 2, 20, 0.5, 'L')}
              ${setting('Spezifische Wärmekapazität', 'cooling.specificHeatKjKgK', 3.8, 2, 4.2, 0.1, 'kJ/(kg·K)')}
              ${setting('Motorblock-Wärmekapazität', 'cooling.engineCapacityKjK', 90, 40, 250, 5, 'kJ/K')}
            </div><button class="secondary-button" id="thermal-apply">Wärmespeicher übernehmen</button></details>
          </article>
        </section>
        <section class="section-page" data-page="experiments" hidden>
          <article class="panel"><div class="panel-heading"><div><span class="panel-kicker">REPRODUZIERBARE A/B-LÄUFE</span><h2>Eine Änderung. Zwei Verläufe.</h2></div><span class="mini-tag">Demo-Messlauf</span></div>
            <div class="experiment-tabs" aria-label="Experiment wählen"><button data-experiment="inertia" class="active">Schwungrad</button><button data-experiment="gearing">Übersetzung</button><button data-experiment="cooling">Kühlung</button></div>
            <p class="experiment-question" id="experiment-question">Wie viel langsamer dreht ein schweres Schwungrad hoch?</p>
            <div class="comparison-slots"><div class="slot-a"><div><span class="slot-label">A</span><strong>Konfiguration A</strong></div><p id="config-a-label"></p><button id="save-a" class="secondary-button">Aktuelle Konfiguration als A</button></div><div class="slot-b"><div><span class="slot-label">B</span><strong>Konfiguration B</strong></div><p id="config-b-label"></p><button id="save-b" class="secondary-button">Aktuelle Konfiguration als B</button></div></div>
            <div class="experiment-actions"><button id="example-pair" class="text-button">Beispielpaar laden</button><button id="run-experiment" class="primary-button">${icon('play', 17)} Vergleich starten</button></div>
            <p class="scenario-note" id="scenario"></p><p class="panel-note" id="controlled-variables"></p>
          </article>
          <article class="panel chart-panel"><div class="panel-heading"><h2 id="comparison-title">Vergleich aus demselben Messablauf</h2><select id="comparison-metric" aria-label="Größe im Vergleichsdiagramm"></select></div><div class="chart-legend"><span><i style="background:var(--teal)"></i>A</span><span><i style="background:var(--amber)"></i>B</span></div><canvas id="comparison-chart" role="img" aria-label="A/B-Zeitverlauf des gewählten Experiments"></canvas><div id="experiment-results" class="experiment-results"><p>Starte einen Vergleich. Jeder Lauf beginnt mit 0 1/min, 0 km/h und identischen Temperaturen.</p></div><div class="chart-footer"><span id="experiment-proof">Noch kein Messlauf vorhanden</span><div class="export-actions"><button id="experiment-json" class="text-button" disabled>JSON</button><button id="experiment-csv" class="text-button" disabled>CSV</button></div></div></article>
        </section>
        <section class="section-page" data-page="model" hidden>
          <article class="panel model-panel"><div class="panel-heading"><div><span class="panel-kicker">WAS DIE ZAHLEN BEDEUTEN</span><h2>Ein Spielzeug mit nachvollziehbarer Physik</h2></div></div>
            <p>Du spielst den Reihensechser BMW M52B28 aus dem offenen Engine-Simulator-Skript von AngeTheGreat: 2,8 Liter, sechs Zylinder und die originale Motor- und Klangberechnung. Das ist eine Simulation; die Werte sind keine Messdaten eines realen BMW.</p>
            <h3>Motor und physischer Sound</h3><p>Der C++-Kern berechnet Mechanik, Gaszustände, Verbrennung, Ansaugung und Auspuff. Sein originaler Synthesizer verarbeitet die Auspuffsignale und Impulsantworten. Die Oberfläche spielt das daraus erzeugte Audiosignal mit 44,1 kHz ab. Für den Motor wird kein zweiter Browser-Oszillator benutzt.</p>
            <h3>Was im klassischen Schnitt sichtbar ist</h3><p>Alle sechs Zylinder stehen nebeneinander. Kolben und Pleuel folgen den nativen Kurbelzapfen; der Ventilhub wird aus den tatsächlichen Nockenprofilen für genau denselben dargestellten Kurbelwinkel abgetastet. Die Zeitlupe verlangsamt nur die Zeichnung auf höchstens 60 U/min. Verbrennung und Strömungsfarben zeigen zuletzt erfasste Werte je Zylinder und Winkel; sie reagieren nach einem neu erfassten Zyklus. Pfeile und Partikel veranschaulichen Flussrichtungen und sind keine Strömungsberechnung.</p>
            <h3>Trägheit und Antrieb</h3><p>Gasverzögerung, Masse, Gänge, Achse und Fahrwiderstände können im laufenden Zustand geändert werden. Motorgeometrie und Schwungradträgheit bleiben beim originalen M52-Wert. Die Kupplung und das Fahrzeug reagieren im originalen Kern. Ein virtuell eingefügtes Bauteil ist kein realer Umbauvorgang: Parameteränderungen erhalten die momentane Drehzahl und Geschwindigkeit. Die Anzeige des Raddrehmoments wird über 0,12 s geglättet. Das Gasdrehmoment entsteht aus Zylinderdruck und Kurbelgeometrie, vor mechanischen Verlusten; es ist keine validierte Prüfstandskurve.</p>
            <h3>Kühlung mit eigenem Wärmeverlauf</h3><p>Drei Wärmespeicher bilden Block, heißen Motorzweig und kühleren Rücklauf ab. Die gesamte Kühlmittelmasse wird auf beide Flüssigkeitsbereiche verteilt. Ein Thermostat öffnet den Kühlerzweig stufenweise von 88 bis 108 °C; Lüfterstufe 1 regelt temperaturabhängig. Angenommen werden 25 % der im Motor freigesetzten Brennstoffenergie als Wärmeeintrag in den Block. Alternativ lassen sich konstante kW einstellen. Pumpe, Kühler, Lüfter und Fahrtwind beeinflussen die Wärmeübertragung. „Warm testen“ setzt nur Block/Kühlmittel/Rücklauf auf 105/95/70 °C. Wärmequelle und Zeitmaßstab bleiben dabei erhalten. Der Wärme-Zeitraffer betrifft nur dieses Modell, während Motor und Ton in Echtzeit bleiben.</p>
            <h3>Eigenes Demo-Modell und A/B-Versuche</h3><p>Die reproduzierbaren A/B-Versuche verwenden ein separates vereinfachtes Lernmodell und sind ausdrücklich so beschriftet. Bei einer fehlenden physischen Verbindung bleiben Motorwerte leer; die App schaltet nicht automatisch zur Demo.</p>
            <h3>Grenzen</h3><p>Keine Simulation von Sieden, Systemdruck, Kühlmittelverlust, Materialschaden oder Reifenhaftung. Das thermische Lernmodell hält deshalb an seiner gewählten Gültigkeitsgrenze von 120 °C Flüssigkeit oder 160 °C Block an. Kennwerte und Regelschwellen sind Annahmen; keine validierte BMW-Kühlung. Der offene Originalkern ist eine andere Grundlage als die separat installierte aktuelle Community Edition. Vollständige Quellen und Modellannahmen stehen im lokalen Projekt unter docs/.</p>
            <p class="panel-note">Beim Fokusverlust werden gehaltene Tasten freigegeben. Der native Motor und sein Ton laufen beim Wechsel zu einem anderen Chat weiter; die thermische Darstellung pausiert im Hintergrund. Ton startet nach deinem Klick auf „Motor starten“.</p>
          </article>
        </section>
      </div>
      <aside class="control-panel panel" aria-label="Motor bedienen">
        <div class="panel-heading"><h2>Am Steuer</h2><span id="audio-status" class="audio-status">Ton bereit</span></div>
        <div class="start-stop"><button id="start" class="primary-button">${icon('play', 18)} Motor starten</button><button id="stop" class="stop-button">${icon('stop', 17)} Stop</button></div>
        <div class="quick-actions"><button id="rev" class="secondary-button">Gasstoß</button><button id="launch" class="secondary-button">Anfahren</button></div>
        <div class="control-block throttle-control" hidden><div class="control-heading"><label for="throttle">Gasstellung</label><div><output id="throttle-output">0</output><span>%</span></div></div><input id="throttle" type="range" min="0" max="100" value="0" step="1" /><div class="range-endpoints"><span>Leerlauf</span><span>Vollgas</span></div><div class="actual-throttle"><span>Drossel folgt dem Pedal</span><strong id="actual-throttle">0 %</strong></div></div>
        <div class="control-block"><label class="switch-row"><span>Prüfstand / Last</span><input type="checkbox" id="load" /><span class="switch-track"></span></label><label class="setting load-setting"><span class="setting-top"><span id="load-label">Bremsmoment</span><output id="load-output">40 Nm</output></span><input id="load-value" type="range" min="0" max="200" step="5" value="40" aria-label="Bremsmoment" /></label><p class="control-help" id="load-help">Definiertes Gegenmoment direkt an der Motorwelle.</p></div>
        <div class="control-block"><span class="control-label">Gang wählen</span><div class="gear-buttons" role="group" aria-label="Gang wählen">${['N', 1, 2, 3, 4, 5].map((g, i) => `<button data-gear="${i}" class="${i === 0 ? 'active' : ''}" aria-pressed="${i === 0}">${g}</button>`).join('')}</div><label class="setting clutch-setting"><span class="setting-top"><span>Kupplung schließen</span><output id="clutch-output">0 %</output></span><input id="clutch" type="range" min="0" max="100" value="0" step="1" /></label><div class="range-endpoints"><span>Getrennt</span><span>Geschlossen</span></div><label class="setting brake-setting"><span class="setting-top"><span>Fahrzeugbremse</span><output id="brake-output">0 %</output></span><input id="brake" type="range" min="0" max="100" value="0" step="5" aria-label="Fahrzeugbremse" /></label></div>
        <div class="temperature-summary"><span class="temp-icon">${icon('cooling', 20)}</span><div><span>Kühlmittel</span><strong id="temp-summary">22,0 °C</strong></div><button class="text-button" data-tab="cooling" aria-label="Kühlung öffnen">${icon('arrow', 19)}</button></div>
        <div class="volume-control"><label for="volume">Lautstärke</label><input id="volume" type="range" min="0" max="100" value="50" step="1" /><output id="volume-output">50 %</output></div>
        <div class="utility-actions"><button id="reset" class="secondary-button">${icon('reset', 17)} Preset zurücksetzen</button><button id="config-export" class="text-button">${icon('export', 16)} Konfiguration als JSON</button><button id="config-import" class="text-button">Konfiguration laden</button><input id="import-file" type="file" accept=".json,application/json" hidden /></div>
      </aside>
    </div>
    <footer class="workspace-footer"><span>ENGINE PLAYGROUND <span>·</span> KEIN REALFAHRZEUG</span><span id="footer-state">Demo · 1 ms Modellschritt · Audio nach Start</span></footer>
  </main>
</div>
<div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
`;
