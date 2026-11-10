import { actualUsd, worstCaseUsd, type Pricing, type Usage } from "../cost/pricing";

export class CostGateError extends Error {
  constructor(
    readonly wouldBe: number,
    readonly maxUsd: number,
  ) {
    super(`this call could take spend to $${wouldBe.toFixed(4)}, above the limit of $${maxUsd}. It was not made.`);
    this.name = "CostGateError";
  }
}

/**
 * A spend cap that holds under concurrency. Each live call reserves its worst
 * case (full output budget) before it starts and settles to the real cost when
 * it ends, so 4 parallel calls can never jointly pass the cap.
 */
export class Budget {
  private spent = 0;
  private reserved = 0;

  constructor(
    private readonly pricing: Pricing,
    readonly maxUsd: number,
  ) {}

  reserve(spec: string, inputChars: number, maxTokens: number): { settle: (usage: Usage) => void; release: () => void } {
    const hold = worstCaseUsd(this.pricing, spec, inputChars, maxTokens);
    const wouldBe = this.spent + this.reserved + hold;
    if (wouldBe > this.maxUsd) throw new CostGateError(wouldBe, this.maxUsd);
    this.reserved += hold;
    let open = true;
    const close = () => {
      if (!open) return false;
      open = false;
      this.reserved -= hold;
      return true;
    };
    return {
      settle: (usage) => {
        if (close()) this.spent += actualUsd(this.pricing, spec, usage);
      },
      release: () => void close(),
    };
  }

  get spentUsd(): number {
    return this.spent;
  }
}
