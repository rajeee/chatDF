// MSW server instance for use in Vitest (Node.js environment).
// Imported by the global test setup file.

import { setupServer } from "msw/node";
import { handlers } from "./handlers";

export const server = setupServer(...handlers);
