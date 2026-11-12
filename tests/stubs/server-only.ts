// Test-only stand-in for the "server-only" package. The real package throws
// when imported outside a server component; under Vitest there is no such
// boundary, so this file does nothing.
export {};
