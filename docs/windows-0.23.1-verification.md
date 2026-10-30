# Windows 0.23.1 tidy portable layout

This patch keeps the student features from [0.23](windows-0.23-verification.md) and reorganizes the Windows portable folder:

```text
Tutor Local.exe
App/
Docs/
Data/                 (created on first launch)
```

The root executable is a native launcher built with electron-builder's pinned NSIS toolset. It requests ordinary user privileges, starts `App/Tutor Local.exe` in place, forwards command-line arguments and returns its exit code. It does not install the app. Runtime libraries/resources and the version-2 portable marker stay in `App`; instructions and top-level licenses are in `Docs`.

The app resolves its portable data folder from the current runtime location on every launch. Moving the complete folder therefore keeps educational history, models, browser state, logs and temporary files in the root `Data` directory. Keep an independent backup and close the app before copying or moving. For an update from 0.23, copy the complete root `Data` folder into the freshly extracted folder with both versions closed.

The ZIP is `Tutor-Local-0.23.1-Portable.zip`, 357,254,384 bytes, SHA-256 `1c03cb2b6534c1fc60787fef1ba5b3b9c44ee21bf1beb2de5712a2f288f78ef6`. The build, all 237 domain tests and 27 packaged workflows passed. The actual ZIP passed the dedicated portable check: a single root-level file, the nested marker, password-free startup, readable history, moved paths and bundled semantic inference. The test starts the runtime directly for Electron path introspection, then uses the actual root launcher and its forwarded debugging arguments after relocation to a path containing spaces and Unicode. Both child app and launcher exit cleanly.

The final manifest in `release/distribution/verification.json` records the exact source commit. The prior 0.23 ZIP and its manifest are preserved separately. Identical local distribution paths may use NTFS hard links to avoid duplicate large archives on the project drive; hash checks still verify their bytes before distribution.

Existing limits remain: unsigned binaries, no clean second-host qualification and no new handwriting or educational-efficacy claims. Account AI continues to reuse the official CLI's own session without copying credentials.
