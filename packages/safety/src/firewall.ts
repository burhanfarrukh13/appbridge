import type { ApprovalView, Effect, PolicyAction } from "@appbridge/core";
import { approvalView, type ApprovalStore } from "./approvals.js";

export interface AuthorizeInput {
  effect: Effect;
  app?: string;
  target?: string;
  reason?: string;
}

export interface FirewallDecision {
  decision: PolicyAction;
  effect: Effect;
  reason: string;
  approvalId?: string;
  approval?: ApprovalView;
}

export interface FirewallOptions {
  policy: Record<Effect, PolicyAction>;
  approvals: ApprovalStore;
  approvalTtlSeconds: number;
}

/**
 * The single gate every action passes through. Grants come from the human, not
 * from the model or from anything written on screen.
 */
export class ActionFirewall {
  private readonly policy: Record<Effect, PolicyAction>;
  private readonly approvals: ApprovalStore;
  private readonly ttl: number;

  constructor(options: FirewallOptions) {
    this.policy = options.policy;
    this.approvals = options.approvals;
    this.ttl = options.approvalTtlSeconds;
  }

  async authorize(input: AuthorizeInput): Promise<FirewallDecision> {
    const configured = this.policy[input.effect] ?? "approve";

    if (configured === "allow") {
      return { decision: "allow", effect: input.effect, reason: `policy allows ${input.effect}` };
    }
    if (configured === "block") {
      return {
        decision: "block",
        effect: input.effect,
        reason: `policy blocks ${input.effect} actions (change [policy] in config.toml to override)`,
      };
    }
    if (configured === "handoff") {
      return {
        decision: "handoff",
        effect: input.effect,
        reason: `a human must do ${input.effect} actions; Appbridge only hands off`,
      };
    }

    const grant = await this.approvals.findGrant(input.effect, input.app, input.target);
    if (grant) {
      if (grant.scope === "once") await this.approvals.consume(grant.id);
      return {
        decision: "allow",
        effect: input.effect,
        reason: `approved by human (${grant.id}, ${grant.scope})`,
        approvalId: grant.id,
      };
    }

    const record = await this.approvals.request({
      effect: input.effect,
      app: input.app,
      target: input.target,
      reason: input.reason ?? `${input.effect} action requires approval`,
      ttlSeconds: this.ttl,
    });
    return {
      decision: "approve",
      effect: input.effect,
      reason: "waiting for human approval",
      approvalId: record.id,
      approval: approvalView(record),
    };
  }
}
