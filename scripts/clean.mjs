import { rmSync } from "node:fs";
for (const path of ["dist", ".build"])
  rmSync(path, { recursive: true, force: true });
