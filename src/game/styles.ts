export const GAME_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Silkscreen:wght@400;700&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap');

:root {
  --sf-white: #FFFFFF;
  --sf-black: #111111;
  --sf-red: #FF0000;
  --sf-gray: #E5E5E5;
  --sf-font-pixel: "Press Start 2P", "Silkscreen", ui-monospace, monospace;
  --sf-font-display: "Silkscreen", "Press Start 2P", ui-monospace, monospace;
  --sf-font-sans: "Space Mono", "Helvetica Neue", Arial, sans-serif;
  --sf-font-mono: "Space Mono", "IBM Plex Mono", "JetBrains Mono", ui-monospace, monospace;
}

* {
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
  -webkit-user-select: none;
}

html, body, #root {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--sf-white);
  color: var(--sf-black);
  font-family: var(--sf-font-sans);
  touch-action: none;
}

.sf-shell {
  position: relative;
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  background: var(--sf-white);
  color: var(--sf-black);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

/* Responsive Mobile-Friendly Landscape Game Viewport Stage (adapts to device screen) */
.sf-viewport-stage {
  position: relative;
  width: 100%;
  height: 100%;
  background: var(--sf-white);
  overflow: hidden;
  flex-shrink: 0;
}

.sf-ui-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.sf-fade-curtain {
  position: absolute;
  inset: 0;
  background: var(--sf-white);
  opacity: 0;
  pointer-events: none;
  z-index: 45;
}

.sf-canvas {
  display: block;
  width: 100%;
  height: 100%;
  background: var(--sf-white);
}

/* Portrait Bottom-Docked Controller Deck (hidden in landscape) */
.sf-portrait-deck {
  display: none;
  width: 100%;
  background: var(--sf-white);
  color: var(--sf-black);
}

/* Swiss Index & Mono Utilities */
.sf-mono {
  font-family: var(--sf-font-mono);
  font-variant-numeric: tabular-nums;
}

.sf-index-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--sf-font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
}

.sf-red-pip {
  display: inline-block;
  width: 8px;
  height: 8px;
  background: var(--sf-red);
  flex-shrink: 0;
}

/* Neo-Brutalist Swiss Buttons */
.sf-btn {
  appearance: none;
  background: var(--sf-white);
  color: var(--sf-black);
  border: 1.5px solid var(--sf-black);
  border-radius: 0;
  padding: 10px 20px;
  font-family: var(--sf-font-mono);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  transition: background-color 0.1s ease, color 0.1s ease, border-color 0.1s ease;
}

.sf-btn:hover {
  background: var(--sf-black);
  color: var(--sf-white);
}

.sf-btn:active {
  background: var(--sf-red);
  border-color: var(--sf-red);
  color: var(--sf-white);
}

.sf-btn-primary {
  background: var(--sf-red);
  color: var(--sf-white);
  border: 1.5px solid var(--sf-red);
  padding: 12px 26px;
  font-family: var(--sf-font-display);
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.05em;
  line-height: 1.2;
}

.sf-btn-primary:hover {
  background: var(--sf-black);
  border-color: var(--sf-black);
  color: var(--sf-white);
}

.sf-btn-compact {
  min-height: 34px;
  padding: 5px 12px;
  font-size: 11px;
  letter-spacing: 0.08em;
}

.sf-btn[aria-pressed="true"] {
  background: var(--sf-black);
  color: var(--sf-white);
  border-color: var(--sf-black);
}

.sf-btn[aria-pressed="true"]::before {
  content: "";
  width: 6px;
  height: 6px;
  background: var(--sf-red);
  display: inline-block;
}

/* Swiss Checklist Toggle (Face Masking Setting) */
.sf-checkbox-toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  background: var(--sf-white);
  color: var(--sf-black);
  border: 1.5px solid var(--sf-black);
  padding: 6px 11px;
  min-height: 34px;
  font-family: var(--sf-font-mono);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.1s ease, color 0.1s ease, border-color 0.1s ease;
}

.sf-checkbox-toggle:hover {
  background: var(--sf-gray);
}

.sf-checkbox-toggle.is-checked {
  border-left: 4px solid var(--sf-red);
}

.sf-checkbox-toggle-block {
  display: flex;
  width: 100%;
  justify-content: space-between;
  min-height: 40px;
  padding: 8px 12px;
}

.sf-checkbox-input {
  position: absolute;
  opacity: 0;
  width: 18px;
  height: 18px;
  margin: 0;
  cursor: pointer;
}

.sf-checkbox-box {
  width: 16px;
  height: 16px;
  border: 1.5px solid var(--sf-black);
  background: var(--sf-white);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background-color 0.1s ease, border-color 0.1s ease;
}

.sf-checkbox-input:focus-visible + .sf-checkbox-box {
  outline: 2px solid var(--sf-red);
  outline-offset: 2px;
}

.sf-checkbox-input:checked + .sf-checkbox-box {
  background: var(--sf-red);
  border-color: var(--sf-red);
}

.sf-checkbox-input:checked + .sf-checkbox-box::after {
  content: "";
  width: 8px;
  height: 4px;
  border-left: 2.2px solid var(--sf-white);
  border-bottom: 2.2px solid var(--sf-white);
  transform: rotate(-45deg) translate(1px, -1px);
  display: block;
}

.sf-checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  line-height: 1.25;
}

.sf-checkbox-status {
  font-size: 9.5px;
  padding: 2px 5px;
  background: var(--sf-gray);
  color: var(--sf-black);
  border: 1px solid var(--sf-black);
  flex-shrink: 0;
}

.sf-checkbox-toggle.is-checked .sf-checkbox-status {
  background: var(--sf-black);
  color: var(--sf-white);
}

.sf-card {
  background: var(--sf-white);
  color: var(--sf-black);
  border: 1.5px solid var(--sf-black);
  padding: 14px;
}

/* Title Overlay — Centered Headline & Generous Negative Space */
.sf-title-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: clamp(22px, 3.6vw, 44px) clamp(24px, 4vw, 52px);
}

.sf-title-top-bar {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
  padding-right: 48px;
  min-height: 36px;
  border-bottom: 1px solid var(--sf-black);
  padding-bottom: 10px;
  pointer-events: auto;
}

.sf-title-top-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.sf-title-top-meta {
  display: flex;
  align-items: center;
  gap: 14px;
  font-family: var(--sf-font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  pointer-events: none;
}

.sf-title-center-stage {
  pointer-events: auto;
  width: min(500px, 88%);
  background: rgba(255, 255, 255, 0.96);
  border: 1.5px solid var(--sf-black);
  display: flex;
  flex-direction: column;
  text-align: center;
  position: relative;
}

.sf-title-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 18px;
  border-bottom: 1px solid var(--sf-black);
  background: var(--sf-gray);
  font-family: var(--sf-font-mono);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.sf-title-hero-block {
  padding: 28px 28px 24px 28px;
  border-bottom: 1px solid var(--sf-black);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.sf-title-kicker {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--sf-font-mono);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  margin-bottom: 12px;
}

.sf-title-h1 {
  margin: 0;
  font-family: var(--sf-font-pixel);
  font-size: clamp(19px, 3.2vw, 32px);
  font-weight: 400;
  line-height: 1.4;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--sf-black);
}

.sf-title-h1-accent {
  color: var(--sf-red);
}

.sf-title-rule-bar {
  width: 68px;
  height: 4px;
  background: var(--sf-red);
  margin: 16px auto 14px auto;
}

.sf-title-desc {
  margin: 0;
  max-width: 410px;
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.55;
  color: var(--sf-black);
}

.sf-title-actions {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  gap: 10px;
  padding: 18px 22px;
  background: var(--sf-white);
}

.sf-title-start-btn {
  width: 100%;
  min-height: 46px;
}

.sf-title-sub-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.sf-title-sub-actions .sf-btn-compact {
  flex: 1 1 110px;
  min-height: 36px;
}

.sf-control-hint {
  pointer-events: none;
  font-family: var(--sf-font-mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--sf-black);
  background: var(--sf-white);
  border-top: 1px solid var(--sf-black);
  padding: 7px 16px;
  text-align: center;
}

.sf-fullscreen-btn {
  position: absolute;
  top: 12px;
  right: 16px;
  z-index: 50;
  width: 36px;
  height: 36px;
  min-height: 36px;
  padding: 0;
  pointer-events: auto;
}

/* Fullscreen Swiss Editorial Menu Screens with Generous Margins */
.sf-screen-overlay {
  position: absolute;
  inset: 0;
  background: var(--sf-white);
  color: var(--sf-black);
  display: flex;
  flex-direction: column;
  padding: clamp(20px, 3vw, 38px) clamp(24px, 4vw, 52px);
  overflow-y: auto;
}

.sf-screen-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  padding-right: 44px;
  border-bottom: 2px solid var(--sf-black);
  flex-shrink: 0;
}

.sf-screen-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  min-width: 0;
}

.sf-screen-index {
  font-family: var(--sf-font-mono);
  font-size: 12px;
  font-weight: 700;
  color: var(--sf-white);
  background: var(--sf-red);
  padding: 3px 8px;
  letter-spacing: 0.08em;
  flex-shrink: 0;
}

.sf-screen-title {
  margin: 0;
  font-family: var(--sf-font-display);
  font-size: clamp(17px, 2.5vw, 28px);
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  overflow-wrap: break-word;
}

/* Mode Select Asymmetrical Swiss Grid */
.sf-mode-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.12fr) minmax(0, 0.96fr) minmax(0, 1.12fr);
  gap: 0;
  margin: auto;
  max-width: 1020px;
  width: 100%;
  border: 1.5px solid var(--sf-black);
}

@media (max-width: 780px) {
  .sf-mode-grid {
    grid-template-columns: minmax(0, 1fr);
    margin: 14px auto;
  }
}

.sf-mode-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 16px;
  text-align: left;
  cursor: pointer;
  background: var(--sf-white);
  color: var(--sf-black);
  border: none;
  border-right: 1.5px solid var(--sf-black);
  padding: 24px 22px;
  font-family: inherit;
  min-width: 0;
  min-height: 240px;
  transition: background-color 0.1s ease, color 0.1s ease;
}

.sf-mode-card:last-child {
  border-right: none;
}

@media (max-width: 780px) {
  .sf-mode-card {
    border-right: none;
    border-bottom: 1.5px solid var(--sf-black);
    min-height: auto;
    padding: 14px 16px;
    gap: 8px;
  }
  .sf-mode-card:last-child {
    border-bottom: none;
  }
}

.sf-mode-card:hover {
  background: var(--sf-black);
  color: var(--sf-white);
}

.sf-mode-card:hover .sf-mode-spec {
  background: var(--sf-red);
  color: var(--sf-white);
  border-color: var(--sf-red);
}

.sf-mode-num {
  font-family: var(--sf-font-pixel);
  font-size: 24px;
  font-weight: 400;
  line-height: 1.25;
  color: var(--sf-red);
  font-variant-numeric: tabular-nums;
}

.sf-mode-name {
  font-family: var(--sf-font-display);
  font-size: clamp(16px, 2vw, 22px);
  font-weight: 700;
  line-height: 1.25;
  text-transform: uppercase;
  margin-top: 8px;
}

.sf-mode-desc {
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.5;
}

.sf-mode-spec {
  display: inline-block;
  align-self: flex-start;
  font-family: var(--sf-font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: var(--sf-gray);
  color: var(--sf-black);
  border: 1px solid var(--sf-black);
  padding: 4px 8px;
}

.sf-diff-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  max-width: 1020px;
  width: 100%;
  margin: 14px auto 0 auto;
  padding-top: 12px;
  border-top: 1px solid var(--sf-black);
  gap: 10px;
  flex-wrap: wrap;
}

/* Online 1v1 Lobby Swiss Grid */
.sf-online-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
  margin: auto;
  max-width: 880px;
  width: 100%;
  border: 1.5px solid var(--sf-black);
}

@media (max-width: 680px) {
  .sf-online-grid {
    grid-template-columns: minmax(0, 1fr);
    margin: 14px auto;
  }
}

.sf-online-card {
  background: var(--sf-white);
  color: var(--sf-black);
  border-right: 1.5px solid var(--sf-black);
  padding: 22px 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 14px;
  min-width: 0;
}

.sf-online-card:last-child {
  border-right: none;
}

@media (max-width: 680px) {
  .sf-online-card {
    border-right: none;
    border-bottom: 1.5px solid var(--sf-black);
    padding: 14px;
    gap: 12px;
  }
  .sf-online-card:last-child {
    border-bottom: none;
  }
}

.sf-online-heading {
  font-family: var(--sf-font-display);
  font-size: clamp(16px, 2.2vw, 24px);
  font-weight: 700;
  line-height: 1.2;
  text-transform: uppercase;
  margin-top: 6px;
}

.sf-online-copy {
  margin: 6px 0 0 0;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5;
}

.sf-room-code-box {
  border: 1.5px solid var(--sf-black);
  border-left: 6px solid var(--sf-red);
  background: var(--sf-gray);
  color: var(--sf-black);
  padding: 12px 12px;
  text-align: center;
  font-family: var(--sf-font-display);
  font-size: clamp(14px, 2vw, 20px);
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  word-break: break-word;
}

.sf-room-name-input {
  width: 100%;
  min-width: 0;
  border: 1.5px solid var(--sf-black);
  border-radius: 0;
  background: var(--sf-white);
  color: var(--sf-black);
  padding: 10px 12px;
  font-family: var(--sf-font-mono);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: 0.03em;
  outline: none;
  min-height: 44px;
}

.sf-room-name-input::placeholder {
  color: #777777;
  font-weight: 600;
  font-size: 11px;
}

.sf-room-name-input:focus {
  border-color: var(--sf-red);
  background: var(--sf-gray);
}

.sf-active-rooms-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 240px;
  overflow-y: auto;
  padding-right: 2px;
}

.sf-active-room-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1.5px solid var(--sf-black);
  background: var(--sf-white);
  padding: 10px 12px;
}

.sf-active-room-row.is-mine {
  background: var(--sf-gray);
  border-left: 5px solid var(--sf-red);
}

.sf-active-room-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.sf-active-room-name {
  font-family: var(--sf-font-display);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.25;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sf-active-room-meta {
  font-family: var(--sf-font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #444444;
}

.sf-active-rooms-empty {
  border: 1.5px dashed var(--sf-black);
  background: var(--sf-gray);
  padding: 16px 12px;
  text-align: center;
  font-family: var(--sf-font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  line-height: 1.5;
  text-transform: uppercase;
}

.sf-status-bar {
  margin: 14px auto 0 auto;
  max-width: 880px;
  width: 100%;
  border: 1.5px solid var(--sf-black);
  background: var(--sf-gray);
  color: var(--sf-black);
  padding: 9px 12px;
  font-family: var(--sf-font-mono);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.sf-status-bar.connected {
  background: var(--sf-black);
  color: var(--sf-white);
  border-left: 6px solid var(--sf-red);
}

/* Character & Stage Select Swiss 3-Column Modular Grid */
.sf-select-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr) minmax(0, 1.2fr);
  grid-template-rows: minmax(0, 1fr);
  gap: 0;
  margin-top: 14px;
  flex: 1;
  min-height: 0;
  width: 100%;
  border: 1.5px solid var(--sf-black);
}

.sf-select-col {
  padding: 14px 16px;
  border-right: 1.5px solid var(--sf-black);
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
}

.sf-select-col:last-child {
  border-right: none;
}

.sf-select-col-stages {
  justify-content: space-between;
  gap: 10px;
  overflow: hidden;
}

.sf-stage-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

@media (max-width: 820px) and (min-height: 501px) {
  .sf-select-layout {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto;
    flex: none;
  }
  .sf-select-col {
    border-right: none;
    border-bottom: 1.5px solid var(--sf-black);
    overflow-y: visible;
    padding: 12px;
  }
  .sf-select-col:last-child {
    border-bottom: none;
  }
  .sf-select-col-stages {
    overflow: visible;
  }
  .sf-stage-wrap {
    flex: none;
    overflow-y: visible;
    padding-right: 0;
  }
}

.sf-col-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 8px;
  margin-bottom: 10px;
  border-bottom: 1px solid var(--sf-black);
  font-family: var(--sf-font-mono);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.sf-roster-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  align-content: start;
}

.sf-char-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  gap: 5px;
  text-align: left;
  background: var(--sf-white);
  color: var(--sf-black);
  border: 1.5px solid var(--sf-black);
  padding: 10px 11px;
  cursor: pointer;
  font-family: inherit;
  min-width: 0;
  min-height: 78px;
  transition: background-color 0.1s ease, color 0.1s ease;
}

.sf-char-meta {
  font-family: var(--sf-font-mono);
  font-size: 9.5px;
  font-weight: 700;
  opacity: 0.85;
  line-height: 1.25;
}

.sf-char-name {
  font-family: var(--sf-font-display);
  font-size: clamp(13px, 1.35vw, 17px);
  font-weight: 700;
  line-height: 1.15;
  overflow-wrap: break-word;
  word-break: break-word;
  max-width: 100%;
}

.sf-char-weapon {
  font-family: var(--sf-font-mono);
  font-size: 9.5px;
  font-weight: 600;
  line-height: 1.25;
}

.sf-char-btn:hover:not([aria-pressed="true"]) {
  background: var(--sf-gray);
}

.sf-char-btn[aria-pressed="true"] {
  background: var(--sf-black);
  color: var(--sf-white);
  border-left: 5px solid var(--sf-red);
}

.sf-stat-mini-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border: 1.5px solid var(--sf-black);
  margin-bottom: 8px;
  background: var(--sf-gray);
}

.sf-stat-mini-cell {
  padding: 6px 8px;
  border-right: 1px solid var(--sf-black);
  min-width: 0;
}

.sf-stat-mini-cell:last-child {
  border-right: none;
}

.sf-stat-mini-label {
  font-family: var(--sf-font-mono);
  font-size: 9px;
  font-weight: 700;
  line-height: 1.2;
}

.sf-stat-mini-val {
  font-family: var(--sf-font-display);
  font-size: clamp(14px, 1.5vw, 18px);
  font-weight: 700;
  line-height: 1.2;
  margin-top: 2px;
}

.sf-char-summary {
  margin: 0;
  font-size: 11px;
  line-height: 1.45;
  font-weight: 500;
}

.sf-opp-name {
  font-family: var(--sf-font-display);
  font-size: clamp(15px, 1.6vw, 20px);
  font-weight: 700;
  line-height: 1.2;
  margin-top: 6px;
}

.sf-opp-sub {
  font-family: var(--sf-font-mono);
  font-size: 10.5px;
  margin-top: 2px;
}

.sf-opp-status {
  font-family: var(--sf-font-mono);
  font-size: 10.5px;
  font-weight: 700;
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid var(--sf-black);
}

.sf-preview-box {
  background: var(--sf-white);
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 8px;
  min-height: 0;
}

.sf-preview-canvas-wrap {
  position: relative;
  width: 100%;
  flex: 1;
  min-height: 150px;
  border: 1px solid var(--sf-black);
  background: var(--sf-white);
  display: flex;
}

.sf-preview-canvas {
  width: 100%;
  height: 100%;
  min-height: 150px;
  display: block;
}

.sf-preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.sf-preview-head-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px 8px;
  margin-top: 2px;
}

.sf-preview-name {
  font-family: var(--sf-font-display);
  font-size: clamp(15px, 1.6vw, 20px);
  font-weight: 700;
  line-height: 1.2;
}

.sf-preview-weapon {
  font-family: var(--sf-font-mono);
  font-size: 10px;
  font-weight: 700;
}

.sf-preview-age {
  font-family: var(--sf-font-mono);
  font-size: 10px;
  margin-top: 2px;
}

.sf-moves-list {
  margin: 5px 0 0 0;
  padding: 0;
  list-style: none;
  font-family: var(--sf-font-mono);
  font-size: 9.4px;
  line-height: 1.32;
  border-top: 1px solid var(--sf-black);
}

.sf-moves-list li {
  border-bottom: 1px solid var(--sf-gray);
  padding: 2.5px 0;
}

.sf-moves-list li:last-child {
  border-bottom: none;
  color: var(--sf-red);
  font-weight: 700;
}

.sf-stage-stack {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
}

@media (max-width: 1060px) and (min-width: 821px) {
  .sf-stage-stack {
    grid-template-columns: minmax(0, 1fr);
  }
}

.sf-stage-btn {
  text-align: left;
  background: var(--sf-white);
  color: var(--sf-black);
  border: 1.5px solid var(--sf-black);
  padding: 8px 9px;
  cursor: pointer;
  font-family: inherit;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  min-height: 66px;
  justify-content: space-between;
}

.sf-stage-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 4px;
  width: 100%;
  min-width: 0;
}

.sf-stage-meta {
  font-family: var(--sf-font-mono);
  font-size: 9px;
  font-weight: 700;
  opacity: 0.78;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sf-stage-meta:first-child {
  flex-shrink: 0;
}

.sf-stage-meta:last-child {
  min-width: 0;
  text-align: right;
}

.sf-stage-name {
  font-family: var(--sf-font-display);
  font-size: clamp(11px, 1.05vw, 13.5px);
  font-weight: 700;
  line-height: 1.2;
  overflow-wrap: break-word;
  word-break: break-word;
  max-width: 100%;
}

.sf-stage-btn:hover:not(:disabled):not([aria-pressed="true"]) {
  background: var(--sf-gray);
}

.sf-stage-btn[aria-pressed="true"] {
  background: var(--sf-black);
  color: var(--sf-white);
  border-left: 5px solid var(--sf-red);
}

/* Gameplay HUD — Proportional Swiss Architectural Framing */
.sf-hud-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 14px 24px;
}

.sf-hud-top {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: start;
  gap: 16px;
  width: 100%;
  padding-left: 8px;
  padding-right: 48px;
}

.sf-fighter-hud {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.sf-fighter-hud-right {
  align-items: flex-end;
}

.sf-hud-fighter-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: 100%;
  min-width: 0;
}

.sf-hud-fighter-row-right {
  justify-content: flex-end;
}

.sf-hud-fighter-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.sf-hud-fighter-body-right {
  align-items: flex-end;
}

.sf-hud-portrait-slot {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
}

.sf-hud-portrait-frame {
  width: 54px;
  height: 65px;
  position: relative;
  display: block;
  flex-shrink: 0;
  filter: drop-shadow(0 2px 0 rgba(17, 17, 17, 0.65));
}

.sf-hud-portrait-cameo {
  position: absolute;
  left: 14%;
  top: 15%;
  width: 72%;
  height: 73.333%;
  border-radius: 50%;
  overflow: hidden;
  background: radial-gradient(circle at 50% 35%, #FFFFFF 0%, #EAEAEA 100%);
  box-shadow: inset 0 0 4px rgba(17, 17, 17, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
}

.sf-hud-portrait-img {
  width: 92%;
  height: 92%;
  object-fit: contain;
  object-position: center 48%;
  display: block;
}

.sf-hud-portrait-ornament {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}

.sf-hud-name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  font-family: var(--sf-font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: var(--sf-white);
  padding: 3px 9px;
  border: 1px solid var(--sf-black);
}

.sf-hp-outer {
  position: relative;
  width: 100%;
  height: 15px;
  background: var(--sf-gray);
  border: 1.5px solid var(--sf-black);
  overflow: hidden;
}

.sf-hp-trail {
  position: absolute;
  top: 0;
  bottom: 0;
  background: var(--sf-red);
}

.sf-hp-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  background: var(--sf-black);
}

.sf-p1-hp { left: 0; }
.sf-p2-hp { right: 0; }

.sf-guard-outer {
  position: relative;
  width: 100%;
  height: 5px;
  background: var(--sf-white);
  border: 1px solid var(--sf-black);
  overflow: hidden;
}

.sf-guard-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  background: var(--sf-black);
  transition: width 0.06s linear;
}

.sf-guard-fill.is-burnout {
  background: var(--sf-red);
}

.sf-hud-status-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}

.sf-hud-status-row-right {
  justify-content: flex-end;
}

.sf-fsm-tag {
  background: var(--sf-white);
  color: var(--sf-black);
  border: 1px solid var(--sf-black);
  border-left: 4px solid var(--sf-red);
  padding: 2px 7px;
  font-family: var(--sf-font-mono);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
}

.sf-fsm-tag.is-burnout {
  background: var(--sf-red);
  color: var(--sf-white);
  border-color: var(--sf-red);
}

.sf-rounds-row {
  display: flex;
  align-items: center;
  gap: 5px;
}

.sf-round-pip {
  width: 9px;
  height: 9px;
  border: 1.5px solid var(--sf-black);
  background: var(--sf-white);
}

.sf-round-pip.won {
  background: var(--sf-red);
  border-color: var(--sf-red);
}

.sf-timer-box {
  background: var(--sf-white);
  color: var(--sf-black);
  border: 1.5px solid var(--sf-black);
  border-top: 4px solid var(--sf-red);
  min-width: 78px;
  padding: 4px 10px 6px 10px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.sf-timer-num {
  font-family: var(--sf-font-pixel);
  font-size: 17px;
  font-weight: 400;
  line-height: 1.25;
}

.sf-round-tag {
  font-family: var(--sf-font-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  margin-bottom: 2px;
  white-space: nowrap;
}

.sf-hud-utils {
  position: absolute;
  top: 84px;
  right: 24px;
  display: flex;
  align-items: center;
  gap: 5px;
  pointer-events: auto;
}

.sf-ping-tag {
  position: absolute;
  top: 84px;
  left: 24px;
  background: var(--sf-white);
  color: var(--sf-black);
  border: 1px solid var(--sf-black);
  padding: 3px 8px;
  font-family: var(--sf-font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

.sf-combo-tag {
  background: var(--sf-black);
  color: var(--sf-white);
  border-left: 4px solid var(--sf-red);
  padding: 3px 10px;
  font-family: var(--sf-font-mono);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums;
  display: inline-block;
}

/* Center Round/KO Banner */
.sf-banner-wrap {
  position: absolute;
  left: 50%;
  top: 28%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  text-align: center;
  max-width: 92%;
}

.sf-banner-box {
  background: var(--sf-black);
  color: var(--sf-white);
  border: 1.5px solid var(--sf-black);
  border-left: 8px solid var(--sf-red);
  padding: 12px 24px;
  font-family: var(--sf-font-pixel);
  font-size: clamp(16px, 3vw, 28px);
  font-weight: 400;
  line-height: 1.3;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  white-space: nowrap;
}

.sf-banner-box.sf-banner-countdown {
  font-size: clamp(24px, 4.4vw, 38px);
  padding: 12px 30px;
}

.sf-subbanner {
  margin-top: 6px;
  background: var(--sf-white);
  color: var(--sf-black);
  border: 1.5px solid var(--sf-black);
  padding: 4px 14px;
  font-family: var(--sf-font-mono);
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  display: inline-block;
}

/* Bottom Super Bar */
.sf-bottom-hud {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  width: 100%;
  padding-bottom: 4px;
}

.sf-super-meter-wrap {
  background: var(--sf-white);
  border: 1.5px solid var(--sf-black);
  padding: 5px 12px;
  width: min(320px, 42%);
  text-align: center;
}

.sf-super-label {
  font-family: var(--sf-font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.09em;
  margin-bottom: 4px;
  font-variant-numeric: tabular-nums;
}

.sf-super-track {
  width: 100%;
  height: 8px;
  border: 1px solid var(--sf-black);
  background: var(--sf-gray);
  position: relative;
}

.sf-super-fill {
  height: 100%;
  background: var(--sf-black);
}

.sf-super-fill.ready {
  background: var(--sf-red);
}

/* Replay Mode Status & Control Bar */
.sf-replay-badge {
  position: absolute;
  top: 66px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 12;
  background: var(--sf-white);
  color: var(--sf-black);
  border: 1.5px solid var(--sf-black);
  padding: 4px 12px;
  font-family: var(--sf-font-mono);
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.1em;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
  transition: background-color 0.12s ease, color 0.12s ease;
}

.sf-replay-badge.is-big-hit {
  background: var(--sf-black);
  color: var(--sf-white);
  border-color: var(--sf-black);
  border-left: 5px solid var(--sf-red);
}

.sf-replay-badge.is-ko {
  background: var(--sf-red);
  color: var(--sf-white);
  border-color: var(--sf-black);
  border-width: 2px;
}

.sf-replay-badge.is-ko .sf-red-pip {
  background: var(--sf-white);
}

.sf-replay-badge.is-paused {
  background: var(--sf-gray);
  color: var(--sf-black);
}

.sf-replay-bar {
  pointer-events: auto;
  background: var(--sf-white);
  border: 1.5px solid var(--sf-black);
  border-top: 3px solid var(--sf-black);
  padding: 8px 12px;
  width: min(560px, 92%);
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.sf-replay-progress-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sf-replay-track {
  flex: 1;
  height: 7px;
  border: 1px solid var(--sf-black);
  background: var(--sf-gray);
  position: relative;
}

.sf-replay-fill {
  height: 100%;
  background: var(--sf-red);
  width: 0%;
}

.sf-replay-time {
  font-family: var(--sf-font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.sf-replay-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  flex-wrap: wrap;
}

.sf-replay-actions .sf-btn-compact {
  flex: 1;
  min-width: 78px;
}

/* 3D Circular Virtual Joystick & Square (Top-Left Cut Corner) Action Buttons */
.sf-touch-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.sf-joystick-zone {
  pointer-events: auto;
  position: absolute;
  left: max(18px, env(safe-area-inset-left, 18px));
  bottom: max(18px, env(safe-area-inset-bottom, 18px));
  width: 132px;
  height: 132px;
  touch-action: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sf-joystick-base-3d {
  position: absolute;
  inset: 0;
  background: var(--sf-black);
  border-radius: 50%;
  transform: translateY(6px);
  pointer-events: none;
}

.sf-joystick-plate {
  position: absolute;
  inset: 0;
  padding: 2px;
  background: var(--sf-black);
  border-radius: 50%;
  pointer-events: none;
  display: flex;
}

.sf-joystick-plate::before {
  content: "";
  position: absolute;
  inset: 2px;
  background: linear-gradient(180deg, #FAFAFA 0%, #ECECEC 100%);
  border-radius: 50%;
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.9), inset 0 -4px 0 #DCDCDC;
}

.sf-joystick-cross {
  position: relative;
  margin: 14px;
  width: calc(100% - 28px);
  height: calc(100% - 28px);
  border: 1.5px solid #C8C8C8;
  background: rgba(255, 255, 255, 0.72);
  border-radius: 50%;
  pointer-events: none;
}

.sf-joystick-cross::before,
.sf-joystick-cross::after {
  content: "";
  position: absolute;
  background: var(--sf-black);
  opacity: 0.22;
}

.sf-joystick-cross::before {
  left: 50%;
  top: 8%;
  bottom: 8%;
  width: 1.5px;
  transform: translateX(-50%);
}

.sf-joystick-cross::after {
  top: 50%;
  left: 8%;
  right: 8%;
  height: 1.5px;
  transform: translateY(-50%);
}

.sf-joystick-knob {
  position: relative;
  z-index: 2;
  width: 54px;
  height: 54px;
  pointer-events: none;
  transform: translate(0px, 0px);
}

.sf-knob-shadow {
  position: absolute;
  inset: 0;
  background: #000000;
  border-radius: 50%;
  transform: translateY(7px);
}

.sf-knob-cap {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, #FF3838 0%, #D40000 100%);
  border-radius: 50%;
  transform: translateY(0px);
  transition: transform 0.06s cubic-bezier(0.2, 0.8, 0.2, 1), background-color 0.08s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sf-knob-cap::before {
  content: "";
  position: absolute;
  inset: 2.5px;
  background: linear-gradient(180deg, #2D2D2D 0%, #141414 100%);
  border-radius: 50%;
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.28), inset 0 -2px 0 #000000;
}

.sf-knob-cap::after {
  content: "";
  position: relative;
  z-index: 1;
  width: 22px;
  height: 22px;
  border: 1.5px solid rgba(255, 255, 255, 0.62);
  border-radius: 50%;
}

.sf-joystick-zone.pressed .sf-knob-cap {
  transform: translateY(6px) scale(0.97);
}

.sf-joystick-zone.pressed .sf-knob-cap::before {
  background: linear-gradient(180deg, #161616 0%, #060606 100%);
  box-shadow: inset 0 1px 0 rgba(255, 0, 0, 0.55);
}

.sf-joystick-zone.pressed .sf-knob-cap::after {
  border-color: var(--sf-red);
  background: rgba(255, 0, 0, 0.24);
}

.sf-touch-buttons {
  pointer-events: auto;
  position: absolute;
  right: max(18px, env(safe-area-inset-right, 18px));
  bottom: max(18px, env(safe-area-inset-bottom, 18px));
  display: grid;
  grid-template-columns: repeat(3, 62px);
  grid-template-rows: repeat(2, 56px);
  gap: 9px 8px;
  touch-action: none;
}

.sf-tbtn {
  position: relative;
  appearance: none;
  background: transparent;
  border: none;
  padding: 0;
  margin: 0;
  cursor: pointer;
  touch-action: none;
  display: block;
}

.sf-tbtn-shadow {
  position: absolute;
  inset: 0;
  background: var(--sf-black);
  transform: translateY(5px);
  clip-path: polygon(12px 0, 100% 0, 100% 100%, 0 100%, 0 12px);
  pointer-events: none;
}

.sf-tbtn-face {
  position: relative;
  z-index: 1;
  display: flex;
  width: 100%;
  height: 100%;
  padding: 2px;
  background: var(--sf-black);
  clip-path: polygon(12px 0, 100% 0, 100% 100%, 0 100%, 0 12px);
  transform: translateY(0px);
  transition: transform 0.06s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.sf-tbtn-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: var(--sf-white);
  color: var(--sf-black);
  clip-path: polygon(10.8px 0, 100% 0, 100% 100%, 0 100%, 0 10.8px);
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.95), inset 0 -3px 0 #DFDFDF;
  font-family: var(--sf-font-mono);
  line-height: 1.1;
  transition: background-color 0.06s ease, color 0.06s ease;
}

.sf-tbtn-main {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
}

.sf-tbtn-sub {
  font-size: 8.5px;
  font-weight: 700;
  opacity: 0.72;
  margin-top: 1px;
}

.sf-tbtn.active .sf-tbtn-face,
.sf-tbtn:active .sf-tbtn-face {
  transform: translateY(4px);
}

.sf-tbtn.active .sf-tbtn-inner,
.sf-tbtn:active .sf-tbtn-inner {
  background: var(--sf-black);
  color: var(--sf-white);
  box-shadow: inset 0 2px 0 rgba(255, 0, 0, 0.35);
}

.sf-tbtn-super-ready .sf-tbtn-shadow {
  background: #7A0000;
}

.sf-tbtn-super-ready .sf-tbtn-inner {
  background: var(--sf-red);
  color: var(--sf-white);
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.32), inset 0 -3px 0 #B80000;
}

.sf-tbtn-super-ready.active .sf-tbtn-inner,
.sf-tbtn-super-ready:active .sf-tbtn-inner {
  background: var(--sf-black);
  color: var(--sf-red);
}

.sf-tbtn-super-disabled .sf-tbtn-face {
  transform: translateY(1px);
}

.sf-tbtn-super-disabled .sf-tbtn-inner {
  background: var(--sf-gray);
  color: #444444;
  box-shadow: inset 0 -2px 0 #CCCCCC;
}

/* Modals */
@keyframes sfModalReveal {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.sf-modal-backdrop {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  padding: 16px;
  background: rgba(255, 255, 255, 0.72);
  z-index: 30;
}

.sf-modal-card {
  background: var(--sf-white);
  color: var(--sf-black);
  border: 2px solid var(--sf-black);
  border-top: 6px solid var(--sf-red);
  padding: 22px 24px;
  width: min(420px, 92%);
  max-height: 92%;
  overflow-y: auto;
  text-align: center;
  animation: sfModalReveal 0.35s ease-out both;
}

.sf-stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0;
  margin: 14px 0 18px 0;
  text-align: left;
  border: 1.5px solid var(--sf-black);
}

.sf-stat-tile {
  border-right: 1px solid var(--sf-black);
  border-bottom: 1px solid var(--sf-black);
  padding: 10px 12px;
  font-variant-numeric: tabular-nums;
  background: var(--sf-white);
}

.sf-stat-tile:nth-child(2n) {
  border-right: none;
}

.sf-stat-tile:nth-child(n+3) {
  border-bottom: none;
}

.sf-stat-k {
  font-family: var(--sf-font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.sf-modal-title {
  margin: 0 0 12px 0;
  font-family: var(--sf-font-display);
  font-size: clamp(17px, 2.5vw, 25px);
  font-weight: 700;
  line-height: 1.25;
  text-transform: uppercase;
}

.sf-modal-sub {
  font-family: var(--sf-font-mono);
  font-size: 11px;
  font-weight: 700;
}

.sf-modal-copy {
  margin: 0 0 16px 0;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.55;
}

.sf-stat-v {
  font-family: var(--sf-font-display);
  font-size: clamp(14px, 1.8vw, 17px);
  font-weight: 700;
  line-height: 1.25;
  margin-top: 2px;
}

/* Settings Modal (Pengaturan Permainan) */
.sf-settings-backdrop {
  z-index: 40;
}

.sf-settings-card {
  width: min(460px, 94%);
  text-align: left;
}

.sf-settings-card .sf-modal-title {
  text-align: center;
  margin-bottom: 14px;
}

.sf-settings-sections {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.sf-settings-group {
  border: 1.5px solid var(--sf-black);
  background: var(--sf-white);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sf-settings-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--sf-black);
  font-family: var(--sf-font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.sf-settings-hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.45;
  color: #333333;
}

.sf-settings-face-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  opacity: 0.42;
  transition: opacity 0.15s ease;
}

.sf-settings-face-strip.is-active {
  opacity: 1;
}

.sf-settings-face-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.sf-settings-face-thumb {
  width: 100%;
  aspect-ratio: 1 / 1;
  border: 1.5px solid var(--sf-black);
  background: #F4F4F4;
  padding: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.sf-settings-face-strip.is-active .sf-settings-face-thumb {
  border-top: 3px solid var(--sf-red);
  background: var(--sf-white);
}

.sf-settings-face-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.sf-settings-face-name {
  font-family: var(--sf-font-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  text-align: center;
}

.sf-settings-btn-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

/* Portrait Mode (Tablet & Mobile): Thin 1px Black Screen Border + Equal Margin Top & Joystick */
@media (orientation: portrait), (max-aspect-ratio: 1 / 1) {
  .sf-viewport-stage::after {
    content: "";
    position: absolute;
    inset: 0;
    border: 1px solid var(--sf-black);
    pointer-events: none;
    z-index: 60;
  }

  body[data-state="title"] .sf-viewport-stage {
    width: 100%;
    height: 100%;
  }

  body[data-state="title"] .sf-title-overlay {
    padding: 16px 14px;
  }

  body[data-state="title"] .sf-title-top-bar {
    padding-right: 42px;
    padding-bottom: 8px;
  }

  body[data-state="title"] .sf-title-top-meta {
    font-size: 10px;
    gap: 8px;
  }

  body[data-state="title"] .sf-title-top-meta > span:last-child {
    display: none;
  }

  body[data-state="title"] .sf-title-center-stage {
    width: min(500px, 96%);
  }

  body[data-state="title"] .sf-title-meta-row {
    padding: 7px 12px;
    font-size: 9px;
  }

  body[data-state="title"] .sf-title-hero-block {
    padding: 20px 16px 16px 16px;
  }

  body[data-state="title"] .sf-title-kicker {
    font-size: 9.5px;
    letter-spacing: 0.1em;
    margin-bottom: 10px;
  }

  body[data-state="title"] .sf-title-h1 {
    font-size: clamp(15px, 4.6vw, 22px);
    line-height: 1.45;
  }

  body[data-state="title"] .sf-title-desc {
    font-size: 11.5px;
  }

  body[data-state="title"] .sf-title-actions {
    padding: 14px;
    gap: 10px;
  }

  body[data-state="title"] .sf-control-hint {
    font-size: 9px;
    padding: 6px 10px;
    line-height: 1.45;
  }

  body[data-state="playing"] .sf-shell,
  body[data-state="paused"] .sf-shell,
  body[data-state="gameover"] .sf-shell,
  body[data-state="replay"] .sf-shell {
    --sf-portrait-gap: clamp(66px, 9.5dvh, 102px);
    justify-content: flex-start;
    padding: var(--sf-portrait-gap) clamp(12px, 2.5vw, 24px) 16px clamp(12px, 2.5vw, 24px);
  }

  body[data-state="playing"] .sf-viewport-stage,
  body[data-state="paused"] .sf-viewport-stage,
  body[data-state="gameover"] .sf-viewport-stage,
  body[data-state="replay"] .sf-viewport-stage {
    width: 100%;
    height: clamp(196px, 38dvh, 56vw);
  }

  body[data-state="playing"] .sf-portrait-deck,
  body[data-state="paused"] .sf-portrait-deck,
  body[data-state="gameover"] .sf-portrait-deck,
  body[data-state="replay"] .sf-portrait-deck {
    display: flex;
    flex: 1;
    min-height: 0;
    flex-direction: column;
    justify-content: flex-start;
    padding: var(--sf-portrait-gap) 0 0 0;
  }

  body[data-state="playing"] .sf-bottom-hud,
  body[data-state="paused"] .sf-bottom-hud,
  body[data-state="gameover"] .sf-bottom-hud,
  body[data-state="replay"] .sf-bottom-hud {
    display: none;
  }

  .sf-portrait-deck-controls {
    order: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    margin: 0;
  }

  .sf-portrait-deck-top {
    position: absolute;
    top: calc(var(--sf-portrait-gap) * 0.5);
    transform: translateY(-50%);
    left: clamp(12px, 2.5vw, 24px);
    right: clamp(12px, 2.5vw, 24px);
    z-index: 65;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: auto;
    margin: 0;
    padding: 0;
    border: none;
  }

  .sf-portrait-deck-top .sf-super-meter-wrap {
    flex: 1;
    min-width: 0;
    width: auto;
    max-width: none;
  }

  .sf-portrait-deck-utils {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .sf-portrait-deck-utils .sf-btn-compact {
    min-height: 32px;
    padding: 4px 8px;
    font-size: 9.5px;
  }

  .sf-portrait-deck .sf-joystick-zone {
    position: relative;
    left: auto;
    bottom: auto;
    width: clamp(118px, 31vw, 138px);
    height: clamp(118px, 31vw, 138px);
    flex-shrink: 0;
  }

  .sf-portrait-deck .sf-touch-buttons {
    position: relative;
    right: auto;
    bottom: auto;
    grid-template-columns: repeat(3, clamp(52px, 14.5vw, 62px));
    grid-template-rows: repeat(2, clamp(50px, 13.5vw, 58px));
    gap: 7px;
    flex-shrink: 0;
  }

  .sf-portrait-deck-foot {
    order: 3;
    margin-top: auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: var(--sf-font-mono);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    opacity: 0.72;
    border-top: 1px solid var(--sf-gray);
    padding-top: 8px;
  }

  /* Compact HUD inside top 16:9 viewport stage on portrait phones */
  .sf-hud-layer {
    padding: 8px 10px;
  }
  .sf-hud-top {
    gap: 5px;
    padding-left: 0;
    padding-right: 36px;
  }
  .sf-hud-fighter-row {
    gap: 4px;
  }
  .sf-hud-fighter-body {
    gap: 3px;
  }
  .sf-hud-portrait-frame {
    width: 36px;
    height: 43px;
    filter: drop-shadow(0 1.5px 0 rgba(17, 17, 17, 0.6));
  }
  .sf-hud-name-row {
    font-size: 8px;
    padding: 1.5px 4px;
    gap: 4px;
    white-space: nowrap;
    min-width: 0;
    overflow: hidden;
  }
  .sf-hud-name-row > span {
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .sf-rounds-row {
    gap: 3px;
    flex-shrink: 0;
  }
  .sf-round-pip {
    width: 6.5px;
    height: 6.5px;
    border-width: 1px;
  }
  .sf-hp-outer {
    height: 9px;
  }
  .sf-guard-outer {
    height: 3.5px;
  }
  .sf-fsm-tag {
    font-size: 7.5px;
    padding: 1px 5px;
    border-left-width: 3px;
  }
  .sf-timer-box {
    min-width: 52px;
    padding: 2px 5px 3px 5px;
  }
  .sf-timer-num {
    font-size: 13px;
  }
  .sf-round-tag {
    font-size: 7px;
    letter-spacing: 0.04em;
  }
  .sf-hud-utils {
    top: 55px;
    right: 10px;
  }
  .sf-hud-utils .sf-btn-compact {
    min-height: 26px;
    padding: 3px 7px;
    font-size: 9px;
  }
  .sf-fullscreen-btn {
    top: 8px;
    right: 8px;
    width: 30px;
    height: 30px;
    min-height: 30px;
  }
  .sf-banner-wrap {
    top: 44%;
  }
  .sf-banner-box {
    font-size: 14px;
    padding: 6px 14px;
    border-left-width: 5px;
  }
  .sf-banner-box.sf-banner-countdown {
    font-size: 20px;
    padding: 8px 18px;
  }
  .sf-subbanner {
    font-size: 9.5px;
    padding: 3px 8px;
  }
  .sf-replay-badge {
    top: auto;
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 9px;
    padding: 3px 9px;
  }
  .sf-portrait-deck .sf-replay-bar {
    width: 100%;
  }
}

/* Mobile Portrait Fine-Tuning for Menu Screens (<= 640px) */
@media (max-width: 640px) {
  .sf-screen-overlay {
    padding: 14px 12px;
  }
  .sf-screen-header {
    padding-bottom: 10px;
    padding-right: 40px;
    gap: 8px;
  }
  .sf-screen-title-group {
    gap: 7px;
  }
  .sf-screen-index {
    font-size: 10px;
    padding: 2px 6px;
  }
  .sf-screen-title {
    font-size: clamp(14px, 4vw, 18px);
  }
  .sf-btn {
    min-height: 40px;
    padding: 8px 14px;
    font-size: 11px;
  }
  .sf-fullscreen-btn {
    top: 8px;
    right: 8px;
    width: 30px;
    height: 30px;
    min-height: 30px;
    padding: 0;
  }
  .sf-btn-compact {
    min-height: 32px;
    padding: 4px 10px;
    font-size: 10px;
  }
  .sf-checkbox-toggle {
    min-height: 32px;
    padding: 5px 9px;
    font-size: 9.5px;
    gap: 7px;
  }
  .sf-checkbox-toggle-block {
    min-height: 36px;
    padding: 7px 10px;
  }
  .sf-btn-primary {
    font-size: 14px;
    padding: 10px 18px;
  }
  .sf-select-layout {
    margin-top: 10px;
  }
  .sf-select-col {
    padding: 10px;
  }
  .sf-col-head {
    font-size: 9.5px;
    padding-bottom: 6px;
    margin-bottom: 8px;
  }
  .sf-roster-grid {
    gap: 6px;
  }
  .sf-char-btn {
    min-height: 62px;
    padding: 8px 9px;
    gap: 3px;
  }
  .sf-char-meta,
  .sf-char-weapon {
    font-size: 9px;
  }
  .sf-char-name {
    font-size: 13px;
  }
  .sf-stat-mini-val {
    font-size: 14px;
  }
  .sf-char-summary {
    font-size: 10.5px;
  }
  .sf-preview-canvas-wrap,
  .sf-preview-canvas {
    min-height: 140px;
    height: 150px;
  }
  .sf-preview-name {
    font-size: 15px;
  }
  .sf-preview-weapon,
  .sf-preview-age {
    font-size: 9.5px;
  }
  .sf-moves-list {
    font-size: 9.5px;
  }
  .sf-stage-stack {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }
  .sf-stage-btn {
    min-height: 54px;
    padding: 7px 8px;
  }
  .sf-stage-meta {
    font-size: 8.5px;
  }
  .sf-stage-name {
    font-size: 11px;
  }
  .sf-mode-num {
    font-size: 18px;
  }
  .sf-mode-name {
    font-size: 15px;
    margin-top: 5px;
  }
  .sf-mode-desc {
    font-size: 11.5px;
  }
  .sf-online-heading {
    font-size: 17px;
  }
  .sf-online-copy {
    font-size: 11.5px;
  }
  .sf-modal-card {
    padding: 16px;
  }
  .sf-modal-title {
    font-size: 17px;
  }
  .sf-stat-tile {
    padding: 8px 10px;
  }
  .sf-stat-v {
    font-size: 14px;
  }
}

/* Mobile Landscape Compact Adjustments (e.g. 844x390, 667x375) */
@media (max-height: 500px) and (orientation: landscape) {
  .sf-btn {
    min-height: 34px;
    padding: 6px 12px;
    font-size: 10.5px;
  }
  .sf-fullscreen-btn {
    top: 8px;
    right: 10px;
    width: 30px;
    height: 30px;
    min-height: 30px;
    padding: 0;
  }
  .sf-btn-compact {
    min-height: 28px;
    padding: 4px 9px;
    font-size: 9.5px;
  }
  .sf-checkbox-toggle {
    min-height: 28px;
    padding: 3px 8px;
    font-size: 9px;
    gap: 6px;
  }
  .sf-checkbox-toggle-block {
    min-height: 32px;
    padding: 5px 9px;
  }
  .sf-btn-primary {
    min-height: 36px;
    padding: 7px 14px;
    font-size: 12.5px;
  }
  .sf-title-overlay {
    padding: 8px 16px;
    gap: 4px;
  }
  .sf-title-top-bar {
    padding-bottom: 4px;
    min-height: 28px;
    padding-right: 40px;
  }
  .sf-title-top-meta {
    font-size: 9.5px;
  }
  .sf-title-meta-row {
    padding: 5px 12px;
    font-size: 9px;
  }
  .sf-title-hero-block {
    padding: 10px 16px 8px 16px;
  }
  .sf-title-kicker {
    font-size: 9px;
    margin-bottom: 6px;
  }
  .sf-title-h1 {
    font-size: clamp(15px, 2.7vw, 22px);
    line-height: 1.32;
  }
  .sf-title-rule-bar {
    margin: 7px auto;
    height: 3px;
  }
  .sf-title-desc {
    font-size: 10.5px;
    line-height: 1.38;
  }
  .sf-title-actions {
    padding: 8px 12px;
    gap: 8px;
  }
  .sf-control-hint {
    font-size: 9px;
    padding: 4px 10px;
  }
  .sf-screen-overlay {
    padding: 10px 14px;
  }
  .sf-screen-header {
    padding-bottom: 7px;
    padding-right: 40px;
  }
  .sf-screen-index {
    font-size: 10px;
    padding: 2px 6px;
  }
  .sf-screen-title {
    font-size: clamp(13.5px, 2.2vw, 18px);
  }
  .sf-mode-grid {
    margin: 8px auto;
  }
  .sf-mode-card {
    min-height: auto;
    padding: 10px 12px;
    gap: 8px;
  }
  .sf-mode-num {
    font-size: 17px;
  }
  .sf-mode-name {
    font-size: 14px;
    margin-top: 4px;
  }
  .sf-mode-desc {
    font-size: 10.5px;
    line-height: 1.35;
  }
  .sf-mode-spec {
    font-size: 9px;
    padding: 3px 6px;
  }
  .sf-diff-row {
    margin-top: 6px;
    padding-top: 8px;
  }
  .sf-online-grid {
    margin: 8px auto;
  }
  .sf-online-card {
    padding: 10px 12px;
    gap: 8px;
  }
  .sf-online-heading {
    font-size: 15px;
    margin-top: 4px;
  }
  .sf-online-copy {
    font-size: 10.5px;
    line-height: 1.35;
  }
  .sf-room-name-input {
    min-height: 36px;
    padding: 6px 10px;
    font-size: 11.5px;
  }
  .sf-active-rooms-list {
    max-height: 130px;
  }
  .sf-status-bar {
    margin-top: 8px;
    padding: 6px 10px;
    font-size: 9.5px;
  }
  .sf-select-layout {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.08fr);
    grid-template-rows: minmax(0, 1fr);
    margin-top: 8px;
    flex: 1;
    min-height: 0;
  }
  .sf-select-col {
    padding: 8px 10px;
    min-height: 0;
    overflow-y: auto;
  }
  .sf-select-col-stages {
    overflow: hidden;
    gap: 6px;
  }
  .sf-col-head {
    font-size: 9px;
    padding-bottom: 4px;
    margin-bottom: 6px;
  }
  .sf-roster-grid {
    gap: 5px;
  }
  .sf-char-btn {
    min-height: 46px;
    padding: 5px 7px;
    gap: 2px;
  }
  .sf-char-meta,
  .sf-char-weapon {
    font-size: 8.5px;
  }
  .sf-char-name {
    font-size: 11.5px;
  }
  .sf-stat-mini-cell {
    padding: 4px 6px;
  }
  .sf-stat-mini-label {
    font-size: 8px;
  }
  .sf-stat-mini-val {
    font-size: 12.5px;
  }
  .sf-char-summary {
    font-size: 9.5px;
    line-height: 1.35;
  }
  .sf-preview-box {
    gap: 4px;
  }
  .sf-preview-canvas-wrap,
  .sf-preview-canvas {
    flex: 0 0 auto;
    min-height: 78px;
    height: 86px;
  }
  .sf-preview-name {
    font-size: 13px;
  }
  .sf-preview-weapon,
  .sf-preview-age {
    font-size: 8.5px;
  }
  .sf-moves-list {
    font-size: 8.8px;
    line-height: 1.3;
    margin-top: 4px;
  }
  .sf-moves-list li {
    padding: 2px 0;
  }
  .sf-stage-stack {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px;
  }
  .sf-stage-btn {
    min-height: 44px;
    padding: 5px 7px;
  }
  .sf-stage-meta {
    font-size: 8px;
  }
  .sf-stage-name {
    font-size: 10px;
    line-height: 1.15;
  }
  .sf-hud-layer {
    padding: 8px 14px;
  }
  .sf-hud-top {
    gap: 10px;
    padding-left: 2px;
    padding-right: 40px;
  }
  .sf-hud-fighter-row {
    gap: 6px;
  }
  .sf-hud-fighter-body {
    gap: 3px;
  }
  .sf-hud-portrait-frame {
    width: 42px;
    height: 50px;
  }
  .sf-hud-name-row {
    font-size: 9.5px;
    padding: 2px 6px;
  }
  .sf-hp-outer {
    height: 12px;
  }
  .sf-guard-outer {
    height: 4px;
  }
  .sf-fsm-tag {
    font-size: 8px;
    padding: 1px 5px;
  }
  .sf-timer-box {
    min-width: 64px;
    padding: 2px 8px 4px 8px;
  }
  .sf-timer-num {
    font-size: 15px;
  }
  .sf-round-tag {
    font-size: 8px;
  }
  .sf-hud-utils {
    top: 62px;
    right: 14px;
  }
  .sf-settings-card {
    padding: 12px 14px;
  }
  .sf-settings-group {
    padding: 9px;
    gap: 6px;
  }
  .sf-settings-face-strip {
    max-width: 260px;
  }
  .sf-banner-box {
    font-size: 18px;
    padding: 6px 18px;
  }
  .sf-banner-box.sf-banner-countdown {
    font-size: 24px;
    padding: 8px 22px;
  }
  .sf-super-meter-wrap {
    width: min(240px, 34%);
    padding: 4px 10px;
  }
  .sf-joystick-zone {
    width: 106px;
    height: 106px;
    left: max(14px, env(safe-area-inset-left, 14px));
    bottom: max(12px, env(safe-area-inset-bottom, 12px));
  }
  .sf-joystick-knob {
    width: 42px;
    height: 42px;
  }
  .sf-touch-buttons {
    right: max(14px, env(safe-area-inset-right, 14px));
    bottom: max(12px, env(safe-area-inset-bottom, 12px));
    grid-template-columns: repeat(3, 52px);
    grid-template-rows: repeat(2, 48px);
    gap: 7px 6px;
  }
  .sf-modal-card {
    padding: 14px 16px;
  }
  .sf-modal-title {
    font-size: 16px;
    margin-bottom: 8px;
  }
  .sf-stats-grid {
    margin: 8px 0 12px 0;
  }
  .sf-stat-tile {
    padding: 6px 8px;
  }
  .sf-stat-v {
    font-size: 14px;
  }
}

/* Text inputs selectable */
input, textarea, select {
  user-select: text;
  -webkit-user-select: text;
}

/* Account & Utility Controls */
.sf-account-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--sf-white);
  border: 1.5px solid var(--sf-black);
  padding: 4px 10px;
  min-height: 34px;
  font-family: var(--sf-font-mono);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  max-width: 240px;
}

.sf-account-chip-email {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sf-account-chip-btn {
  appearance: none;
  cursor: pointer;
  color: var(--sf-black);
  transition: background-color 0.1s ease, color 0.1s ease;
}

.sf-account-chip-btn:hover {
  background: var(--sf-black);
  color: var(--sf-white);
}

.sf-account-dot {
  width: 7px;
  height: 7px;
  background: #16A34A;
  flex-shrink: 0;
}

.sf-account-dot.is-guest {
  background: #777777;
}

.sf-btn-admin {
  border-color: var(--sf-red);
  color: var(--sf-red);
}

.sf-btn-admin:hover {
  background: var(--sf-red);
  color: var(--sf-white);
}

/* Tabs & Forms */
.sf-modal-wide {
  width: min(560px, 95%);
  text-align: left;
}

.sf-tabs-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border: 1.5px solid var(--sf-black);
  margin-bottom: 14px;
}

.sf-tabs-row.is-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.sf-tabs-row.is-4 {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.sf-tab-btn {
  appearance: none;
  background: var(--sf-white);
  color: var(--sf-black);
  border: none;
  border-right: 1.5px solid var(--sf-black);
  padding: 8px 6px;
  min-height: 38px;
  font-family: var(--sf-font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
}

.sf-tab-btn:last-child {
  border-right: none;
}

.sf-tab-btn[aria-selected="true"] {
  background: var(--sf-black);
  color: var(--sf-white);
  border-bottom: 3px solid var(--sf-red);
}

.sf-form-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sf-field-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
}

.sf-field-label {
  font-family: var(--sf-font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.sf-text-input {
  width: 100%;
  min-width: 0;
  border: 1.5px solid var(--sf-black);
  border-radius: 0;
  background: var(--sf-white);
  color: var(--sf-black);
  padding: 9px 11px;
  font-family: var(--sf-font-mono);
  font-size: 12.5px;
  font-weight: 600;
  outline: none;
  min-height: 40px;
}

.sf-text-input:focus {
  border-color: var(--sf-red);
  background: #FAFAFA;
}

.sf-form-alert {
  border: 1.5px solid var(--sf-black);
  padding: 8px 10px;
  font-family: var(--sf-font-mono);
  font-size: 10.5px;
  font-weight: 700;
  line-height: 1.4;
}

.sf-form-alert.is-error {
  border-left: 5px solid var(--sf-red);
  background: #FFF1F1;
  color: #990000;
}

.sf-form-alert.is-success {
  border-left: 5px solid #16A34A;
  background: #F0FDF4;
  color: #14532D;
}

/* Edit Karakter & Precision Oval Cropper */
.sf-edit-char-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 12px;
}

.sf-edit-char-tab {
  appearance: none;
  background: var(--sf-white);
  color: var(--sf-black);
  border: 1.5px solid var(--sf-black);
  padding: 6px 4px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-family: var(--sf-font-mono);
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
}

.sf-edit-char-tab[aria-selected="true"] {
  background: var(--sf-black);
  color: var(--sf-white);
  border-top: 4px solid var(--sf-red);
}

.sf-edit-char-thumb {
  width: 38px;
  height: 46px;
  border: 1px solid var(--sf-black);
  background: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 50%;
}

.sf-edit-char-thumb img {
  width: 90%;
  height: 90%;
  object-fit: contain;
}

.sf-edit-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
  gap: 14px;
  align-items: start;
}

@media (max-width: 600px) {
  .sf-edit-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.sf-crop-stage {
  border: 1.5px solid var(--sf-black);
  background: var(--sf-gray);
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.sf-crop-canvas {
  width: 100%;
  max-width: 240px;
  aspect-ratio: 4 / 5;
  border: 1.5px solid var(--sf-black);
  background: #FFFFFF;
  cursor: grab;
  touch-action: none;
  display: block;
}

.sf-crop-canvas:active {
  cursor: grabbing;
}

.sf-crop-slider-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--sf-font-mono);
  font-size: 10px;
  font-weight: 700;
}

.sf-crop-slider-label {
  min-width: 44px;
  text-align: left;
  flex-shrink: 0;
}

.sf-crop-slider {
  flex: 1;
  min-width: 0;
  accent-color: var(--sf-red);
}

.sf-crop-slider-val {
  min-width: 34px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.sf-crop-meta {
  font-family: var(--sf-font-mono);
  font-size: 9.5px;
  font-weight: 700;
  color: #333333;
  text-align: center;
  line-height: 1.4;
}

.sf-file-input-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

/* Public Room History Status Badges */
.sf-room-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: var(--sf-font-mono);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 2px 6px;
  border: 1px solid var(--sf-black);
  margin-bottom: 3px;
  align-self: flex-start;
}

.sf-room-status-pill.is-online {
  background: #F0FDF4;
  border-color: #15803D;
  color: #15803D;
}

.sf-room-status-pill.is-offline {
  background: #F5F5F5;
  border-color: #777777;
  color: #B91C1C;
}

.sf-room-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.sf-room-dot.is-online {
  background: #16A34A;
}

.sf-room-dot.is-offline {
  background: #DC2626;
}

.sf-active-room-row.is-offline {
  background: #F7F7F7;
  border-style: dashed;
}

/* In-Room Live Chat (Compact Semi-Transparent Overlay) */
.sf-chat-dock {
  position: absolute;
  left: 24px;
  top: 112px;
  z-index: 25;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.sf-chat-dock.is-menu {
  top: auto;
  bottom: 16px;
  left: 24px;
}

.sf-chat-toggle-row {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: min(300px, 76vw);
}

.sf-chat-toggle-btn {
  position: relative;
  appearance: none;
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(4px);
  color: var(--sf-black);
  border: 1.5px solid var(--sf-black);
  padding: 5px 10px;
  min-height: 30px;
  font-family: var(--sf-font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.sf-chat-toggle-btn:hover {
  background: var(--sf-black);
  color: var(--sf-white);
}

.sf-chat-unread-dot {
  width: 8px;
  height: 8px;
  background: var(--sf-red);
  border-radius: 50%;
  flex-shrink: 0;
}

.sf-chat-preview-toast {
  background: rgba(17, 17, 17, 0.86);
  color: var(--sf-white);
  border-left: 3px solid var(--sf-red);
  padding: 4px 8px;
  font-family: var(--sf-font-mono);
  font-size: 9.5px;
  max-width: 190px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sf-chat-panel {
  width: min(290px, 78vw);
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(5px);
  border: 1.5px solid var(--sf-black);
  border-top: 4px solid var(--sf-red);
  display: flex;
  flex-direction: column;
}

.sf-chat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 8px;
  border-bottom: 1px solid var(--sf-black);
  background: rgba(229, 229, 229, 0.85);
  font-family: var(--sf-font-mono);
  font-size: 9.5px;
  font-weight: 700;
}

.sf-chat-messages {
  max-height: 138px;
  min-height: 68px;
  overflow-y: auto;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.sf-chat-msg {
  font-family: var(--sf-font-mono);
  font-size: 10px;
  line-height: 1.35;
  word-break: break-word;
}

.sf-chat-msg-sender {
  font-weight: 700;
  color: var(--sf-black);
}

.sf-chat-msg-sender.is-mine {
  color: var(--sf-red);
}

.sf-chat-form {
  display: flex;
  border-top: 1px solid var(--sf-black);
}

.sf-chat-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: rgba(255, 255, 255, 0.95);
  padding: 6px 8px;
  font-family: var(--sf-font-mono);
  font-size: 11px;
  outline: none;
}

.sf-chat-send-btn {
  appearance: none;
  border: none;
  border-left: 1px solid var(--sf-black);
  background: var(--sf-black);
  color: var(--sf-white);
  padding: 0 10px;
  font-family: var(--sf-font-mono);
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
}

.sf-chat-send-btn:hover {
  background: var(--sf-red);
}

@media (orientation: portrait), (max-aspect-ratio: 1 / 1) {
  .sf-chat-dock {
    left: 10px;
    top: 56px;
  }
  .sf-chat-messages {
    max-height: 82px;
    min-height: 44px;
  }
}

/* Admin Panel & User Detail Inspection */
.sf-modal-admin {
  width: min(740px, 96%);
  text-align: left;
}

.sf-admin-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.sf-admin-count-badge {
  font-family: var(--sf-font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  border: 1.5px solid var(--sf-black);
  background: var(--sf-gray);
  padding: 8px 10px;
  white-space: nowrap;
}

.sf-admin-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 320px;
  overflow-y: auto;
  margin-bottom: 14px;
}

.sf-admin-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1.5px solid var(--sf-black);
  padding: 9px 11px;
  background: var(--sf-white);
}

.sf-admin-row.is-blocked {
  background: #FFF1F1;
  border-left: 5px solid var(--sf-red);
}

.sf-admin-row-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.sf-admin-email {
  font-family: var(--sf-font-mono);
  font-size: 11.5px;
  font-weight: 700;
  word-break: break-all;
}

.sf-admin-uid {
  font-family: var(--sf-font-mono);
  font-size: 9.5px;
  color: #555555;
  word-break: break-all;
  margin-top: 2px;
}

.sf-admin-meta {
  font-family: var(--sf-font-mono);
  font-size: 9.5px;
  font-weight: 700;
  margin-top: 3px;
}

.sf-admin-meta.is-ok {
  color: #15803D;
}

.sf-admin-meta.is-blocked {
  color: #B91C1C;
}

.sf-admin-detail-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.sf-admin-account-box {
  border: 1.5px solid var(--sf-black);
  background: var(--sf-gray);
  padding: 10px 12px;
  margin-bottom: 12px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 14px;
  font-family: var(--sf-font-mono);
  font-size: 10.5px;
}

.sf-admin-account-item {
  min-width: 0;
}

.sf-admin-account-k {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #555555;
  text-transform: uppercase;
}

.sf-admin-account-v {
  font-weight: 700;
  word-break: break-all;
  margin-top: 2px;
}

.sf-admin-block-panel {
  border: 1.5px solid var(--sf-black);
  background: var(--sf-white);
  padding: 10px 12px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.sf-admin-block-panel.is-blocked {
  background: #FFF1F1;
  border-left: 5px solid var(--sf-red);
}

.sf-admin-status-tag {
  display: inline-block;
  padding: 2px 7px;
  font-family: var(--sf-font-mono);
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.08em;
  border: 1px solid var(--sf-black);
  text-transform: uppercase;
}

.sf-admin-status-tag.is-ok {
  background: #F0FDF4;
  border-color: #15803D;
  color: #15803D;
}

.sf-admin-status-tag.is-blocked {
  background: var(--sf-red);
  border-color: var(--sf-black);
  color: var(--sf-white);
}

.sf-admin-char-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.sf-admin-char-card {
  border: 1.5px solid var(--sf-black);
  background: var(--sf-white);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sf-admin-char-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.sf-admin-char-slot {
  font-family: var(--sf-font-mono);
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.sf-admin-source-tag {
  font-family: var(--sf-font-mono);
  font-size: 8.5px;
  font-weight: 800;
  letter-spacing: 0.07em;
  padding: 2px 5px;
  border: 1px solid var(--sf-black);
  text-transform: uppercase;
}

.sf-admin-source-tag.is-default {
  background: var(--sf-gray);
  color: #444444;
}

.sf-admin-source-tag.is-custom {
  background: var(--sf-black);
  color: var(--sf-white);
  border-bottom: 2px solid var(--sf-red);
}

.sf-admin-oval-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sf-admin-oval-preview {
  width: 68px;
  height: 84px;
  flex-shrink: 0;
  border-radius: 50% / 50%;
  border: 2px solid var(--sf-black);
  box-shadow: inset 0 0 0 2px var(--sf-white), 0 0 0 1px var(--sf-red);
  background: var(--sf-white);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sf-admin-oval-preview img {
  width: 92%;
  height: 92%;
  object-fit: contain;
}

.sf-admin-char-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.sf-admin-char-actions .sf-btn-compact {
  flex: 1;
  min-width: 0;
  font-size: 9.5px;
  padding: 6px 6px;
}

.sf-admin-footer-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.sf-admin-footer-actions .sf-btn {
  flex: 1;
  min-width: 140px;
}

@media (max-width: 620px) {
  .sf-admin-toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .sf-admin-row {
    flex-direction: column;
    align-items: stretch;
  }
  .sf-admin-row-actions {
    justify-content: flex-end;
  }
  .sf-admin-account-box,
  .sf-admin-char-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* About Modal Links */
.sf-about-box {
  border: 1.5px solid var(--sf-black);
  background: var(--sf-gray);
  padding: 12px 14px;
  margin-bottom: 14px;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-family: var(--sf-font-mono);
  font-size: 11.5px;
}

.sf-about-link {
  color: var(--sf-red);
  font-weight: 700;
  text-decoration: underline;
  word-break: break-all;
}

/* Halaman User Modal (Profil Editable + Riwayat Pertandingan 1v1) */
.sf-modal-user {
  width: min(620px, 96%);
}

.sf-user-name-panel {
  border: 1.5px solid var(--sf-black);
  background: var(--sf-white);
  padding: 12px;
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sf-user-name-row {
  display: flex;
  align-items: stretch;
  gap: 8px;
}

.sf-user-name-row .sf-text-input {
  flex: 1;
}

.sf-user-kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border: 1.5px solid var(--sf-black);
  margin-bottom: 12px;
  background: var(--sf-white);
}

.sf-user-kpi-tile {
  padding: 9px 10px;
  border-right: 1px solid var(--sf-black);
  text-align: left;
  font-variant-numeric: tabular-nums;
}

.sf-user-kpi-tile:last-child {
  border-right: none;
}

.sf-match-history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 280px;
  overflow-y: auto;
  margin-bottom: 14px;
  padding-right: 2px;
}

.sf-match-history-row {
  border: 1.5px solid var(--sf-black);
  background: var(--sf-white);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-variant-numeric: tabular-nums;
}

.sf-match-history-row.is-win {
  border-left: 5px solid #16A34A;
}

.sf-match-history-row.is-loss {
  border-left: 5px solid var(--sf-red);
}

.sf-match-history-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.sf-match-result-tag {
  font-family: var(--sf-font-mono);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 2px 6px;
  border: 1px solid var(--sf-black);
}

.sf-match-result-tag.is-win {
  background: #F0FDF4;
  border-color: #15803D;
  color: #15803D;
}

.sf-match-result-tag.is-loss {
  background: #FFF1F1;
  border-color: var(--sf-red);
  color: #990000;
}

.sf-match-room-name {
  font-family: var(--sf-font-display);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.sf-match-history-vs {
  font-family: var(--sf-font-mono);
  font-size: 11px;
  font-weight: 700;
  color: var(--sf-black);
}

.sf-match-history-meta {
  font-family: var(--sf-font-mono);
  font-size: 9.5px;
  font-weight: 600;
  color: #444444;
  letter-spacing: 0.04em;
}

/* Online Lobby Identity Bar & Daftar Juara / Peringkat 1v1 */
.sf-online-identity-bar {
  margin: 12px auto 10px auto;
  max-width: 880px;
  width: 100%;
  border: 1.5px solid var(--sf-black);
  background: var(--sf-white);
  padding: 8px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.sf-online-identity-info {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-family: var(--sf-font-mono);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.05em;
  min-width: 0;
}

.sf-leaderboard-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  max-height: 240px;
  overflow-y: auto;
  padding-right: 2px;
}

.sf-leaderboard-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  border: 1.5px solid var(--sf-black);
  background: var(--sf-white);
  padding: 8px 10px;
  font-variant-numeric: tabular-nums;
}

.sf-leaderboard-row.is-top-1 {
  border-left: 5px solid var(--sf-red);
}

.sf-leaderboard-row.is-mine {
  background: var(--sf-gray);
}

.sf-leaderboard-rank {
  font-family: var(--sf-font-display);
  font-size: 14px;
  font-weight: 700;
  min-width: 34px;
  text-align: center;
  padding: 4px 6px;
  border: 1px solid var(--sf-black);
  background: var(--sf-gray);
}

.sf-leaderboard-rank.is-champion {
  background: var(--sf-red);
  border-color: var(--sf-red);
  color: var(--sf-white);
}

.sf-leaderboard-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sf-leaderboard-name {
  font-family: var(--sf-font-display);
  font-size: 12.5px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sf-leaderboard-meta {
  font-family: var(--sf-font-mono);
  font-size: 9.5px;
  font-weight: 700;
  color: #444444;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.sf-leaderboard-score {
  text-align: right;
  flex-shrink: 0;
}

.sf-leaderboard-wins {
  font-family: var(--sf-font-display);
  font-size: 13px;
  font-weight: 700;
  color: var(--sf-black);
}

.sf-leaderboard-wr {
  font-family: var(--sf-font-mono);
  font-size: 9.5px;
  font-weight: 700;
  color: var(--sf-red);
}

@media (max-width: 640px) {
  .sf-user-name-row {
    flex-direction: column;
  }
  .sf-user-kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .sf-user-kpi-tile:nth-child(2n) {
    border-right: none;
  }
  .sf-user-kpi-tile:nth-child(-n+2) {
    border-bottom: 1px solid var(--sf-black);
  }
  .sf-settings-btn-row {
    grid-template-columns: minmax(0, 1fr);
  }
  .sf-title-top-actions {
    gap: 6px;
  }
}

@media (max-height: 500px) and (orientation: landscape) {
  .sf-online-identity-bar {
    margin: 6px auto;
    padding: 5px 10px;
  }
  .sf-leaderboard-list {
    max-height: 130px;
  }
  .sf-match-history-list {
    max-height: 145px;
  }
}

/* Danger Buttons, Room Action Cluster, Danger Zone & Confirm Modals */
.sf-btn-danger {
  border-color: var(--sf-red);
  background: #FFF1F1;
  color: #990000;
}

.sf-btn-danger:hover:not(:disabled) {
  background: var(--sf-red);
  color: var(--sf-white);
}

.sf-active-room-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.sf-user-danger-zone {
  border: 1.5px solid var(--sf-red);
  border-left: 5px solid var(--sf-red);
  background: #FFF1F1;
  padding: 12px;
  margin-bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sf-user-danger-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(153, 0, 0, 0.35);
  font-family: var(--sf-font-mono);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #990000;
  text-transform: uppercase;
}

.sf-danger-warning-box {
  border: 1.5px solid var(--sf-red);
  border-left: 5px solid var(--sf-red);
  background: #FFF1F1;
  color: #7F1D1D;
  padding: 10px 12px;
  font-family: var(--sf-font-mono);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.5;
  text-align: left;
  margin-bottom: 12px;
}

.sf-modal-confirm {
  width: min(460px, 95%);
  text-align: left;
}

@media (max-width: 520px) {
  .sf-active-room-row {
    flex-direction: column;
    align-items: stretch;
  }
  .sf-active-room-actions {
    justify-content: flex-end;
  }
}
`;



