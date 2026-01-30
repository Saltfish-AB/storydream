---
name: sound-effects
description: Sound effects library for Remotion video productions
metadata:
  tags: remotion, audio, sound, sfx, effects
---

# Sound Effects Library

A curated collection of sound effects for Remotion video productions. This skill provides access to professional-quality audio assets organized by category.

## Overview

The sound effects library includes:
- **Transitions** - Whooshes, swooshes, swipes for scene changes
- **Impacts** - Clicks, pops, thuds for emphasis
- **UI** - Interface sounds for notifications and feedback
- **Ambient** - Background atmospheres and environments
- **Musical** - Stingers, risers, and musical accents

## Quick Usage

```tsx
import { Audio } from "@remotion/media";
import { staticFile } from "remotion";

// Add a whoosh sound at the start of a transition
<Sequence name="Transition Sound" from={30} durationInFrames={15}>
  <Audio src={staticFile("sfx/transitions/whoosh-fast.mp3")} volume={0.7} />
</Sequence>
```

## File Location

All sound effects are stored in `public/sfx/` and accessed via `staticFile()`:

```
public/sfx/
├── transitions/    # Scene change sounds
├── impacts/        # Emphasis and hit sounds
├── ui/             # Interface feedback
├── ambient/        # Background atmospheres
└── musical/        # Stingers and accents
```

## Rules Index

- `catalog.md` - Complete list of all available sound effects
- `transitions.md` - Whooshes, swooshes, and movement sounds
- `impacts.md` - Clicks, pops, hits, and emphasis sounds
- `ui.md` - User interface and notification sounds
- `ambient.md` - Background and atmospheric sounds
- `musical.md` - Stingers, risers, and musical elements

## Best Practices

1. **Layer sounds** - Combine multiple subtle sounds for richer audio
2. **Match duration** - Use shorter sounds for quick cuts, longer for slow transitions
3. **Control volume** - Keep SFX at 0.3-0.7 to not overpower other audio
4. **Time precisely** - Align sound peaks with visual moments using `from` prop
5. **Use Sequence** - Wrap audio in named Sequences for timeline visibility
