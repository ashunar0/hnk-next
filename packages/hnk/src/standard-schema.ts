/**
 * Standard Schema（https://standardschema.dev）の型。hnk はスキーマのライブラリを決め打ちせず、
 * この形を満たすもの（zod、valibot など）を受け取る。型だけなので、依存は増えない
 */
export interface StandardSchema<Input = unknown, Output = Input> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly types?:
      { readonly input: Input; readonly output: Output } | undefined;
    readonly validate: (
      value: unknown,
    ) => StandardResult<Output> | Promise<StandardResult<Output>>;
  };
}

export type StandardResult<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<{ readonly message: string }> };

export type InferInput<S extends StandardSchema<any, any>> = NonNullable<
  S["~standard"]["types"]
>["input"];

export type InferOutput<S extends StandardSchema<any, any>> = NonNullable<
  S["~standard"]["types"]
>["output"];

/** JSON Schema を出せるスキーマ。OpenAPI の文書を作るときだけ要る（Standard JSON Schema） */
export type JsonSchemaCapable = {
  readonly "~standard": {
    readonly jsonSchema: {
      readonly input: (options: JsonSchemaOptions) => Record<string, unknown>;
      readonly output: (options: JsonSchemaOptions) => Record<string, unknown>;
    };
  };
};

export type JsonSchemaOptions = {
  target: string;
  /** 各ライブラリ固有の指定を渡す口。知らないライブラリは無視する */
  libraryOptions?: Record<string, unknown>;
};

const canEmitJsonSchema = (
  schema: StandardSchema<any, any>,
): schema is StandardSchema<any, any> & JsonSchemaCapable =>
  "jsonSchema" in schema["~standard"];

/**
 * スキーマを JSON Schema にする。出せないスキーマなら、何を使えばいいかを添えて throw する。
 * 文書の中に埋め込むので、各スキーマの `$schema` は外す
 */
export const toJsonSchema = (
  schema: StandardSchema<any, any>,
  io: "input" | "output",
  options: JsonSchemaOptions,
): Record<string, unknown> => {
  if (!canEmitJsonSchema(schema))
    throw new Error(
      `この schema（${schema["~standard"].vendor}）は JSON Schema を出せない。OpenAPI の文書には、Standard JSON Schema を満たすものを使う`,
    );

  const { $schema: _, ...converted } =
    schema["~standard"].jsonSchema[io](options);

  return converted;
};

/**
 * hnk が自分で持つスキーマを作る。検査と JSON Schema を手で書き、どのライブラリにも依存しない。
 * 型（Input・Output）は、検査の中身と合わせて呼ぶ側が決める
 */
export const hnkSchema = <Input, Output>(
  validate: (
    value: unknown,
  ) => StandardResult<Output> | Promise<StandardResult<Output>>,
  jsonSchema: (
    io: "input" | "output",
    options: JsonSchemaOptions,
  ) => Record<string, unknown>,
): StandardSchema<Input, Output> & JsonSchemaCapable => ({
  "~standard": {
    version: 1,
    vendor: "hnk",
    validate,
    jsonSchema: {
      input: (options) => jsonSchema("input", options),
      output: (options) => jsonSchema("output", options),
    },
  },
});

/** 検査の失敗を 1 つ返す */
export const issue = (message: string) => ({ issues: [{ message }] }) as const;
