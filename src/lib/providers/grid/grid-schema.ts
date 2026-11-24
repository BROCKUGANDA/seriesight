import { z } from "zod";
import { gridRequest, type GridClientConfig } from "./grid-client";
import { GridError, type GRID_ENDPOINTS } from "./grid-types";

const ref = z.object({ kind: z.string(), name: z.string().nullish(), ofType: z.unknown().optional() });
const schemaResponse = z.object({ __schema: z.object({
  queryType: z.object({ name: z.string() }),
  types: z.array(z.object({ name: z.string(), kind: z.string(), fields: z.array(z.object({
    name: z.string(), type: ref,
    args: z.array(z.object({ name: z.string(), type: ref, defaultValue: z.string().nullish() })),
  })).nullish() })),
}) });

// Standard GraphQL introspection: selections are built from the account's actual
// schema, not from speculative example fields or a hard-coded title entitlement.
const TYPE_REF = "kind name ofType { kind name ofType { kind name ofType { kind name } } }";
export const GRID_SCHEMA_QUERY = `query SeriesightSchema { __schema { queryType { name } types { name kind fields { name args { name defaultValue type { ${TYPE_REF} } } type { ${TYPE_REF} } } } } }`;
type Schema = z.infer<typeof schemaResponse>["__schema"];
type Field = NonNullable<Schema["types"][number]["fields"]>[number];
type Selection = { [name: string]: true | Selection };

function named(type: z.infer<typeof ref>): string {
  if (type.name) return type.name;
  const parsed = ref.safeParse(type.ofType);
  if (!parsed.success) throw new GridError("INVALID_SCHEMA", "GRID type reference is incomplete.");
  return named(parsed.data);
}

export class GridSchema {
  constructor(private readonly schema: Schema) {}
  private field(type: string, name: string): Field | undefined {
    return this.schema.types.find((t) => t.name === type)?.fields?.find((f) => f.name === name);
  }
  private select(type: string, selection: Selection): string {
    return Object.entries(selection).flatMap(([name, children]) => {
      const field = this.field(type, name);
      if (!field || field.args.some((a) => a.type.kind === "NON_NULL" && a.defaultValue == null)) return [];
      const target = this.schema.types.find((t) => t.name === named(field.type));
      if (children === true) return target && ["SCALAR", "ENUM"].includes(target.kind) ? [name] : [];
      const nested = this.select(named(field.type), children);
      return nested ? [`${name} { ${nested} }`] : [];
    }).join(" ");
  }
  query(root: string, argument: string, selection: Selection): string {
    const field = this.field(this.schema.queryType.name, root);
    const arg = field?.args.find((a) => a.name === argument);
    if (!field || !arg || !["ID", "String"].includes(named(arg.type)) || field.args.some((a) => a.name !== argument && a.type.kind === "NON_NULL" && a.defaultValue == null)) {
      throw new GridError("INVALID_SCHEMA", "GRID account schema does not expose the required series lookup.");
    }
    const projection = this.select(named(field.type), selection);
    if (!projection) throw new GridError("INVALID_SCHEMA", "GRID account schema has no supported series fields.");
    return `query SeriesightHistorical($id: ${named(arg.type)}!) { ${root}(${argument}: $id) { ${projection} } }`;
  }
}

export async function inspectGridSchema(endpoint: keyof typeof GRID_ENDPOINTS, config?: GridClientConfig): Promise<GridSchema> {
  const parsed = schemaResponse.safeParse(await gridRequest<unknown>({ endpoint, query: GRID_SCHEMA_QUERY }, config));
  if (!parsed.success) throw Object.assign(new GridError("INVALID_SCHEMA", "GRID introspection is unavailable or invalid; import is disabled rather than guessing fields."), {
    validationIssues: parsed.error.issues.slice(0, 10).map((issue) => ({ code: issue.code, path: issue.path.map((part) => typeof part === "number" ? "[]" : part) })),
  });
  return new GridSchema(parsed.data.__schema);
}

export const HISTORICAL_CENTRAL_SELECTION: Selection = {
  id: true, startTimeScheduled: true, title: { id: true, name: true, nameShortened: true },
  tournament: { id: true, name: true }, format: { name: true },
  teams: { baseInfo: { id: true, name: true } },
};
export const HISTORICAL_STATE_SELECTION: Selection = {
  id: true, finished: true, updatedAt: true, format: true,
  title: { nameShortened: true }, teams: { id: true, name: true, won: true },
  games: {
    id: true, sequenceNumber: true, finished: true,
    clock: { currentSeconds: true },
    teams: { id: true, name: true, side: true, won: true, players: {
      id: true, name: true, role: true, character: { id: true, name: true },
    } },
    draftActions: { type: true, sequenceNumber: true, drafter: { id: true, type: true }, draftable: { id: true, name: true, type: true } },
  },
};