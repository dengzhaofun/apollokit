/**
 * RatingStrategy 抽象 + Elo 实现。纯函数，无外部依赖 —— service 只
 * 负责把 DB 状态喂进来、把结果写回。未来切 Glicko-2 时新增一个
 * `createGlicko2Strategy` 并在 service 里按 `ratingParams.strategy`
 * 分发即可，service 与 schema 都不用动。
 *
 * ---------------------------------------------------------------------
 * 团队模式：teamMode = "avgTeamElo"
 * ---------------------------------------------------------------------
 *
 * 1. 按 matchTeamId 分组算队均 MMR `R_team`；
 * 2. 两队情形：对每个玩家用 `E = 1/(1 + 10^((R_other - R_self_team)/400))`
 *    算期望胜率；`actual = win ? 1 : 0`（平局 0.5）；
 * 3. 多队 / FFA：把每位玩家分别与"每一个其他队均分"两两结算，delta
 *    累加后除以对手队数取平均；
 * 4. 同队玩家共用本队的 `actual - E`，delta 均匀发放；
 * 5. 若 `perfWeight > 0 && performanceScore 存在`，额外叠加
 *    `perfWeight * K * (performanceScore - 0.5)`，最后裁剪到 [-K, +K]；
 * 6. Deviation / Volatility 原样透传（Elo 不动它们）。
 */

export type RatingInput = {
  endUserId: string;
  matchTeamId: string;
  placement: number;
  win: boolean;
  performanceScore?: number | null;
  mmrBefore: number;
  mmrDeviation: number;
  mmrVolatility: number;
};

export type RatingOutput = {
  endUserId: string;
  mmrAfter: number;
  mmrDeviationAfter: number;
  mmrVolatilityAfter: number;
};

export type RatingStrategy = {
  readonly name: "elo" | "glicko2";
  compute(params: {
    participants: RatingInput[];
    teamCount: number;
    /** 透传 tierConfig.ratingParams，策略自行解析 */
    params: Record<string, unknown>;
  }): RatingOutput[];
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Elo 期望胜率 */
function expected(rSelf: number, rOther: number): number {
  return 1 / (1 + Math.pow(10, (rOther - rSelf) / 400));
}

function readNumber(
  obj: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const v = obj[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function createEloStrategy(): RatingStrategy {
  return {
    name: "elo",
    compute({ participants, teamCount, params }) {
      const K = readNumber(params, "baseK", 32);
      const perfWeight = clamp(readNumber(params, "perfWeight", 0), 0, 1);

      if (teamCount < 2 || participants.length < 2) {
        // 不合法输入：按原样返回（上层应在 service 里先拦截）
        return participants.map((p) => ({
          endUserId: p.endUserId,
          mmrAfter: p.mmrBefore,
          mmrDeviationAfter: p.mmrDeviation,
          mmrVolatilityAfter: p.mmrVolatility,
        }));
      }

      // 1. 按 matchTeamId 分组
      const teams = new Map<string, RatingInput[]>();
      for (const p of participants) {
        const arr = teams.get(p.matchTeamId) ?? [];
        arr.push(p);
        teams.set(p.matchTeamId, arr);
      }

      // 2. 算每队均分 + 每队"实际得分"（胜=1 / 负=0，平局 / 多队用
      //    placement 推导：在两队情形下所有 placement==1 的队 = 胜方；
      //    多队情形 actual 用"名次归一化"：top = 1，bottom = 0，线性）。
      const teamIds = [...teams.keys()];
      const avgMmrByTeam = new Map<string, number>();
      const actualByTeam = new Map<string, number>();

      for (const matchTeamId of teamIds) {
        const arr = teams.get(matchTeamId)!;
        const avg = arr.reduce((s, p) => s + p.mmrBefore, 0) / arr.length;
        avgMmrByTeam.set(matchTeamId, avg);
      }

      if (teamCount === 2) {
        // 两队：谁胜谁拿 1。同队的 win 应该一致（service 也会校验），
        // 取第一人即可；若两队都 false（平局）→ 各 0.5
        for (const matchTeamId of teamIds) {
          const arr = teams.get(matchTeamId)!;
          const teamWon = arr.some((p) => p.win);
          actualByTeam.set(matchTeamId, teamWon ? 1 : 0);
        }
        const wins = [...actualByTeam.values()].filter((v) => v === 1).length;
        if (wins === 0) {
          // 双方都 false → 平局
          for (const matchTeamId of teamIds) actualByTeam.set(matchTeamId, 0.5);
        } else if (wins === teamIds.length) {
          // 双方都 win → 也按平局处理（防御）
          for (const matchTeamId of teamIds) actualByTeam.set(matchTeamId, 0.5);
        }
      } else {
        // 多队：用每队最佳 placement 做线性归一化
        const bestPlacement = new Map<string, number>();
        for (const matchTeamId of teamIds) {
          const arr = teams.get(matchTeamId)!;
          bestPlacement.set(
            matchTeamId,
            arr.reduce((m, p) => Math.min(m, p.placement), Infinity),
          );
        }
        // 最优名次 = 1，最差 = teamCount
        // actual = (teamCount - placement) / (teamCount - 1)，线性归一化到 [0,1]
        for (const matchTeamId of teamIds) {
          const p = bestPlacement.get(matchTeamId)!;
          const actual = (teamCount - p) / (teamCount - 1);
          actualByTeam.set(matchTeamId, clamp(actual, 0, 1));
        }
      }

      // 3. 对每队算"对所有其他队"的平均期望胜率
      const expectedByTeam = new Map<string, number>();
      for (const matchTeamId of teamIds) {
        const rSelf = avgMmrByTeam.get(matchTeamId)!;
        let sum = 0;
        let n = 0;
        for (const otherId of teamIds) {
          if (otherId === matchTeamId) continue;
          const rOther = avgMmrByTeam.get(otherId)!;
          sum += expected(rSelf, rOther);
          n++;
        }
        expectedByTeam.set(matchTeamId, n > 0 ? sum / n : 0.5);
      }

      // 4. 给每位玩家发 delta。同队共用 `actual - E`，再叠加个人表现项。
      const out: RatingOutput[] = [];
      for (const p of participants) {
        const actual = actualByTeam.get(p.matchTeamId)!;
        const exp = expectedByTeam.get(p.matchTeamId)!;
        let delta = K * (actual - exp);

        if (
          perfWeight > 0 &&
          typeof p.performanceScore === "number" &&
          Number.isFinite(p.performanceScore)
        ) {
          const perfDelta = perfWeight * K * (p.performanceScore - 0.5);
          delta += perfDelta;
        }

        delta = clamp(delta, -K, K);

        out.push({
          endUserId: p.endUserId,
          mmrAfter: p.mmrBefore + delta,
          mmrDeviationAfter: p.mmrDeviation,
          mmrVolatilityAfter: p.mmrVolatility,
        });
      }

      return out;
    },
  };
}

/**
 * 策略分发入口。service 拿 `tierConfig.ratingParams.strategy` 决定用哪个。
 * 目前只实现 Elo，其他策略走 Elo 兜底（让 service 层先跑起来）。
 */
export function createRatingStrategy(strategy: string): RatingStrategy {
  switch (strategy) {
    case "elo":
    default:
      return createEloStrategy();
  }
}
