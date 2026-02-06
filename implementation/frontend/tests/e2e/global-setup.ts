// E2E global setup: starts the seeding server before all tests.
import { startSeedingServer } from "./fixtures/data";

export default async function globalSetup() {
  await startSeedingServer();
}
