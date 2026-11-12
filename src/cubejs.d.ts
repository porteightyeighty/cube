declare module 'cubejs' {
  export default class Cube {
    static initSolver(): void;
    static fromString(facelets: string): Cube;
    static random(): Cube;
    move(alg: string): Cube;
    asString(): string;
    isSolved(): boolean;
    solve(maxDepth?: number): string;
  }
}
