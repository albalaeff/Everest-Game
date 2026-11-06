# Performance

The targets: 60 frames a second on an average laptop and 30 on a mid-range phone, a download under 20 MB, in Chrome, Firefox, Edge and Safari ([../../spec.md](../../spec.md) → Technical architecture), for an expedition of about 2 hours. These rules keep the game there ([../guidelines.md](../guidelines.md) has the principles); #90 measures it.

## Budgets

- **A frame's own work takes at most 10 ms at 60 frames a second.** A frame lasts 16.7 ms, and the browser needs about 6 of them ([web.dev, RAIL](https://web.dev/articles/rail)). The work is the frame's steps of the expedition, the scene's update and the drawing's commands. At 30 on a phone, it takes at most half the 33 ms frame, so the rate holds once the phone has warmed up and slowed down.
  - *In Everest:* `GameLoop` takes at most `MAX_STEPS_A_FRAME` steps in a frame, so a frame after a locked screen doesn't freeze the page.
  - *Check:* a Performance recording over a minute of climbing, on a laptop and on the phones of #92.
- **Input is handled within 50 ms, so it shows within 100** ([RAIL](https://web.dev/articles/rail)).
- **A steady rate beats a high one.** A rate that wavers feels worse than a steady 30, and a phone that runs flat out heats up, then slows down ([Android Developers, Netmarble and ADPF](https://developer.android.com/stories/games/netmarble-got-adpf)). A phone that can't hold 60 is held at 30 (Pixi's `Ticker.maxFPS`), and the quality steps down before the rate wavers.
  - *In Everest:* the levels of `GraphicsQuality`; the cap, with #90.
  - *Check:* on the phones of #92 after 20 minutes of climbing, not in the first: the slowest frames, and how warm the phone is.
- **The first visit plays within 5 seconds on a mid-range phone, and the download is under 20 MB** ([RAIL](https://web.dev/articles/rail); [../../spec.md](../../spec.md)). The graphics and the sound are made in code, so what weighs is the code and the content; later visits come from the service worker (#61).
  - *Check:* the build's size from `npm run build`; the first load on the phones of #92.

## PixiJS

From [PixiJS's performance tips](https://pixijs.com/8.x/guides/concepts/performance-tips), for this game:

- **Few draw calls: like goes with like.** Pixi draws objects in one call while they can share a batch; switching between kinds of object, blend modes or too many textures breaks it, so a layer keeps one kind of object where it can.
- **What doesn't change isn't rebuilt.** A layer is drawn once and moved by its transform ([../conventions/rendering.md](../conventions/rendering.md) → A layer is drawn once); a complex layer that never changes is drawn into a texture once ([`cacheAsTexture`](https://pixijs.com/8.x/guides/components/scene-objects/container/cache-as-texture)), and again when the screen changes size.
- **Particles go in a `ParticleContainer`, with only what changes dynamic,** as `SnowLayer`'s flakes, whose position alone moves.
- **Text that changes goes in the HTML, or in `BitmapText`:** a Pixi `Text` redraws a canvas and uploads it to the GPU on every change.
- **Pixels are a phone's cost.** At three device pixels to a CSS pixel, a phone draws nine times the pixels it would at one; the quality's cap on sharpness (`GraphicsQuality`: 1 at Low, 1.5 at Medium) is the strongest lever. Antialiasing costs too, and WebGL fixes it when the context is made, so it's chosen with the quality, at the start.
- **A full-screen filter is a pass over every pixel.** Hypoxia's muted colours and narrowing view (#43) take one pass at most, at a lower resolution, or are drawn into the layers' own colours.
- **Culling is off in Pixi by default.** A layer with many objects off the screen, a long section's anchors and climbers, turns it on, and a recording says whether it helped: it saves the GPU's time and spends the CPU's.
- **The picture comes back after a lost WebGL context.** A phone can take the GPU from a page in the background; when the page comes back, the scene draws again, or says it can't ([`WEBGL_lose_context`](https://registry.khronos.org/webgl/extensions/WEBGL_lose_context/)).
  - *In Everest:* no issue yet.
  - *Check:* a story loses the context with `WEBGL_lose_context`, restores it, and reads `#slope`'s frames counting again.

## The HTML on top

- **The DOM changes only when what it shows changes,** as `FpsReadout` writes once a second, when a new reading comes; a frame never reads the layout after writing to it.
- **What moves in the HTML moves by `translate`, `transform` or `opacity`,** which the browser's compositor does without a layout ([web.dev, compositor-only properties](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count)).
  - *In Everest:* the joystick's knob moves by `top` and `left` (`#knob` in `style.css`), a layout at every move of the thumb (#90).

## Memory

- **A frame allocates nothing it could keep.** The garbage collector stops the frame to collect, and small arrays and objects made 60 times a second add up to a stutter every few seconds: the scene's frame reuses its objects. The core makes new frozen values by design ([../conventions.md](../conventions.md) → Objects), but only 20 times a second.
- **Memory stays flat for hours.** A heap snapshot after an hour of climbing is no larger than after ten minutes, beyond what the expedition's history adds.
  - *Check:* Chrome DevTools → Memory, on a laptop.

## The battery

- **In camp, when nothing moves, the frame rate drops** ([../../spec.md](../../spec.md) → Phone and PC → Performance): the scene draws when something changes, or at a few frames a second for the snow (#53).
- **Hidden, nothing runs.** With the page hidden, the loop stops and the sound's `AudioContext` is suspended (#88).

## Measuring

- **Frame times, not the average.** An average hides a stutter: a second of 54 frames of 16.7 ms and one of 100 ms reads as 55 frames a second, and the player sees the 100 ms. The frame rate on the page shows the slowest 1% of the frames and the worst, beside the average.
  - *In Everest:* `FrameRate` counts the frames over a second (`#fps`); the slowest frames come with #90.
- **On the real phones, not headless.** Headless browsers draw in software ([../conventions/rendering.md](../conventions/rendering.md) → The stories), so the targets are measured by hand on the phones of #92, with Chrome's remote DevTools (`chrome://inspect`) and Safari's Web Inspector. On a laptop, DevTools' 4× CPU slowdown is a rough stand-in for a phone.
