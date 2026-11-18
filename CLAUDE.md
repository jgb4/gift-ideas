# Project Instructions

## UI / Design
- Use shadcn/ui as the default component system.
- Before creating a UI primitive, check whether an appropriate existing component exists.
- Aim for restrained product UI similar in spirit to Linear and Vercel.
- Favor typography, spacing, alignment, and subtle borders over decoration.
- Keep layouts compact.
- Use neutral colors with one accent color.
- Avoid gradients, glows, oversized radii, decorative icons, and excessive shadows.
- Cards are not the default container. Prefer sections, rows, whitespace, and dividers.
- Deliberately under-design first implementations. Establish hierarchy and usability before adding visual personality.

## Engineering
- Reuse existing components before creating new ones.
- Keep changes scoped to the requested task.
- Run relevant tests after changes.

## Shipping
- After every change: run `cd web && npm run build`, check it, then commit and push to `main` without asking. Pushing to `main` is what deploys the live site on GitHub Pages.
