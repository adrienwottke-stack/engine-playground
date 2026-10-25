# Attribution und Lizenzhinweise

**ws 8.22.0**: WebSocket-Transport für native Steuerung und Ton, [websockets/ws](https://github.com/websockets/ws), MIT. Die unveränderte Bibliothek einschließlich Original-Lizenz liegt in `native/vendor/ws/`; Herkunft und geprüfte Paketintegrität stehen in `native/vendor/ws-PROVENANCE.md`.

Die Browser-Demo, Oberfläche, Kühlungs-/Antriebs-Lernmodelle und Bridge wurden für Engine Playground erstellt. Sie verwenden keine Audioaufnahme eines BMW und beanspruchen keine Originaldaten oder exakte Klangtreue.

**Engine Simulator Original**: AngeTheGreat / Ange Yaghi, [ange-yaghi/engine-sim](https://github.com/ange-yaghi/engine-sim), Commit 85f7c3b959a908ed5232ede4f1a4ac7eafe6b630, MIT. Der vollständige Lizenztext steht in `native/ENGINE_SIM_LICENSE.txt` und in `native/source/LICENSE`. Das native I6-Preset ist aus dem dort enthaltenen M52B28-Skript abgeleitet, mit geändertem Hub, Volumen, Referenzwinkel, Trägheit, Grenze und eigener Fahrzeug-/Getriebedefinition. Es ist ein Lernpreset.

Submodule des geprüften Originals:

| Projekt | Commit |
|---|---|
| csv-io | 2112c55e1e831c8f7a1b91de23722b7926ad3d00 |
| delta-studio | b7d0a046733b924d12706baf1e5e59ba427aa7b1 |
| direct-to-video | 19f939c88d740d9e42755d6191daff5719be198f |
| piranha | 432f0b122bb1663b686c553c7e7269300afac3bc |
| simple-2d-constraint-solver | e009f4ff1c9c4c5874e865e893cdb62e208fb2b3 |

Vorhandene Hinweise und Lizenzdateien dieser Projekte und ihrer mitgelieferten Bibliotheken bleiben in der lokalen Quellkopie erhalten. Die MIT-Lizenz des Originalprojekts wird nicht pauschal auf alle Drittanbieter-Binärbibliotheken oder spätere Editionen übertragen. Zusätzliche Buildabhängigkeiten benötigen ihre jeweiligen Lizenzen und Laufzeitdateien.

**Community Edition**: separat heruntergeladene offizielle Release-Datei v0.1.14a, [Distributionsrepository](https://github.com/Engine-Simulator/engine-sim-community-edition). Sie enthält keinen Anwendungscode; die offene Original-Lizenz wird ihr nicht unterstellt. Der originale Release-ZIP bleibt neben der entpackten Anwendung erhalten. Keine Binäränderung oder Weiterveröffentlichung wurde vorgenommen.

Entwicklungswerkzeuge: TypeScript, Vite, tsx und Playwright mit ihren jeweiligen Paketlizenzen. Die produktive Browseranwendung benötigt nach dem Build keine externe CDN-Schrift, Anmeldung oder Remote-API. Schriftfamilien werden über vorhandene Systemfonts gewählt.

**v0.2 Console-Host:** Der startfähige native Kern ist aus dem offenen Original und dessen Piranha-/Solver-/CSV-Quellen gebaut. Laufzeit- und Portierungsänderungen stehen in `native/headless/PORTED.json`; Compiler, Commit, Buildoptionen und EXE-Hash in `BUILD.json`. Vorhandene Engine-/Solver-/CSV-Lizenztexte sind in `native/headless/` enthalten. Der Piranha-Submodulstand enthält keine separate oberste Lizenzdatei; seine Quellen und ursprüngliche README bleiben erhalten, ohne ihm pauschal eine zusätzliche Lizenz zuzuweisen.

LLVM-MinGW 20261006 UCRT x86_64 wurde von der offiziellen Veröffentlichung bezogen; der Compiler selbst wird nicht im Lieferpaket verteilt. Die EXE enthält statisch gelinkte Laufzeitbestandteile. Zugehörige LLVM- und MinGW-w64-/winpthreads-Hinweise stehen in `native/headless/notices/`. Das dort verwendete originale `FlexLexer.h` und die generierten Parser behalten ihre eingebetteten Lizenzhinweise. winflexbison 2.5.25 ist ein separates Entwicklungswerkzeug und wird nicht im Lieferpaket verteilt.
