# Fruit Keyboard

## Project purpose

This project is a fruit keyboard powered by an Arduino UNO R3. Touching a fruit
acts as a key press. Each key should trigger a musical note or an audio clip on a
connected computer.

There is no speaker attached to the Arduino, and its memory is too limited for
larger audio recordings. The board detects input and sends key events over USB
serial; the computer browser generates notes or plays audio files locally.
Do not design around storing audio on the UNO or streaming audio from it.

## Architecture and current scope

- `/` is the existing Web Serial console for configuring the connection,
  inspecting board output, and sending commands.
- `/keys` is the fruit keyboard interface. Start with interactive browser keys
  and note playback so it can be tried without hardware.
- Use the installed `react-web-serial` package for serial integration.
- The intended flow is fruit touch → Arduino key event → Web Serial → browser
  key mapping → note or audio clip playback.
- No firmware or agreed serial key-event protocol is currently present. Treat
  any proposed message format, pin assignments, or fruit mapping as provisional;
  do not silently assume the board already implements them.
- Browser interaction and serial input should eventually share the same key
  playback path. Support audio clips as a future extension of note mappings.

## Implementation conventions

- Stack: React 19, TypeScript, TanStack Start/Router, Vite, and Tailwind CSS 4.
- Add file-based pages under `src/routes/`. Use TanStack `Link` for navigation.
- `src/routeTree.gen.ts` is generated; regenerate it rather than editing it by
  hand.
- Use shadcn/ui components for UI elements. Reuse existing components under
  `src/components/ui/` before building custom controls, and use the `#/` import
  alias. Follow the existing dark slate/cyan visual style and responsive layouts.
- Keep browser-only APIs (`navigator.serial`, `AudioContext`, etc.) out of module
  initialization and server rendering. The console already mounts its serial
  provider only after hydration.
- Web Serial requires a supporting browser (typically desktop Chromium) and
  HTTPS or localhost. Port selection must follow a user action. Handle missing
  support, cancelled selection, and disconnection gracefully.
- Initialize/resume browser audio after a user gesture. Clean up audio nodes,
  contexts, event listeners, and timers when their owning component unmounts.
- Make keys usable with pointer, touch, and keyboard input, with visible focus
  and accessible labels. Hardware should not be required to preview notes.
- When implementing serial event parsing, account for messages split across
  chunks and multiple messages in one chunk. Avoid replaying historical events
  during rerenders. Keep serial connection ownership explicit between pages.
- Keep changes focused; do not add dependencies when existing packages or
  browser APIs suffice.

## Development and verification

The repository uses Bun and includes `bun.lock`.

- Install dependencies: `bun install`
- Start development: `bun --bun run dev` (port 3000)
- Generate routes: `bun run generate-routes`
- Production build: `bun --bun run build`
- Lint: `bun run lint`
- Type-check: `bun x tsc --noEmit`
- Check formatting: `bun run check`

Format only files touched by the task rather than rewriting unrelated files.
For keyboard changes, verify routing, browser playback after user interaction,
keyboard accessibility, and cleanup. Hardware integration must be checked with
an actual board separately; a successful build does not verify serial behavior.
