import { describe, expect, it } from "vitest";
import { discoveryPlan, named, typeText } from "../../scripts/grid-live-smoke.mjs";

const scalar = (name: string) => ({ kind: "SCALAR", name });
const input = (name: string) => ({ kind: "INPUT_OBJECT", name });
const list = (ofType: object) => ({ kind: "LIST", name: null, ofType });
const required = (ofType: object) => ({ kind: "NON_NULL", name: null, ofType });
const schema = () => ({
  queryType: { name: "Query" },
  types: [
    { name: "Query", fields: [{ name: "allSeries", type: { kind: "OBJECT", name: "Connection" }, args: [
      { name: "first", type: scalar("Int"), defaultValue: null },
      { name: "after", type: scalar("String"), defaultValue: null },
      { name: "filter", type: input("SeriesFilter"), defaultValue: null },
    ] }] },
    { name: "Connection", fields: [{ name: "edges" }] },
    { name: "SeriesFilter", inputFields: [{ name: "titleId", type: input("IdFilter") }] },
    { name: "IdFilter", inputFields: [{ name: "in", type: list(required(scalar("ID"))) }] },
  ],
});

describe("GRID live smoke schema planning", () => {
  it("preserves nested GraphQL type wrappers", () => {
    expect(typeText(required(list(required(scalar("ID")))))).toBe("[ID!]!");
    expect(named(required(list(scalar("ID"))))).toBe("ID");
  });

  it("uses the schema's title filter and cursor arguments", () => {
    const plan = discoveryPlan(schema(), "test-title");
    expect(plan.variables).toEqual({ first: 50, after: null, filter: { titleId: { in: ["test-title"] } } });
    expect(plan.query).toContain("$filter: SeriesFilter");
    expect(plan.query).toContain("after: $after");
    expect(plan.query).not.toContain("test-title");
  });

  it("does not invent a title filter when the schema lacks one", () => {
    const source = schema();
    source.types[2].inputFields = [];
    expect(discoveryPlan(source, "test-title").variables).not.toHaveProperty("filter");
  });

  it("fails closed for unknown required arguments", () => {
    const source = schema();
    Object.assign(source.types[0].fields![0], { args: [
      { name: "unsupported", type: required(scalar("String")), defaultValue: null },
    ] });
    expect(() => discoveryPlan(source, "test-title")).toThrow("SCHEMA_UNSUPPORTED_REQUIRED_ARGUMENT");
  });

  it("fails closed when discovery is not exposed", () => {
    const source = schema();
    source.types[0].fields = [];
    expect(() => discoveryPlan(source, "test-title")).toThrow("SCHEMA_NO_ALL_SERIES");
  });
});