import { describe, expect, it } from "vitest";

import { Prisma } from "@prisma/client";

describe("exit schema", () => {
  it("prevents duplicate post-exit observations for the same episode/horizon", () => {
    const observationUnique = Prisma.dmmf.datamodel.models
      .find((model) => model.name === "PostExitObservation")
      ?.uniqueIndexes.find((index) => index.fields.join(",") === "positionEpisodeId,horizon");

    expect(observationUnique).toBeDefined();
  });

  it("keeps one exit snapshot per position episode", () => {
    const field = Prisma.dmmf.datamodel.models
      .find((model) => model.name === "PositionExitSnapshot")
      ?.fields.find((item) => item.name === "positionEpisodeId");

    expect(field?.isUnique).toBe(true);
  });
});
