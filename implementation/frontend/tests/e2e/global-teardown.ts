// E2E global teardown: stops the seeding server after all tests.
import { stopSeedingServer } from "./fixtures/data";

export default async function globalTeardown() {
  await stopSeedingServer();
}
