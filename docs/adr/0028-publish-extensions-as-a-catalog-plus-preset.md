# Publish extensions as a catalog plus preset

Status: accepted

T3 Code's reusable local capabilities will be distributed as a catalog of independently selectable T3 Extensions rather than as one indivisible plugin stack. Jordan's preferred combination will be a versioned Jordan Extension Stack preset in that catalog, so another adopter can choose the complete experience or install only individual capabilities without inheriting unrelated features. This accepts more compatibility and dependency work per extension in exchange for independent adoption, clearer boundaries, and a distribution model that can outlive the current fork layout.

## Considered Options

- One indivisible stack: simpler to test as a single unit, but forces adopters to take unrelated capabilities and couples every feature's compatibility lifecycle.
- Catalog plus preset: preserves Jordan's complete stack while making each extension independently adoptable and replaceable.
