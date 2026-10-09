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

type JsonSchemaOptions = {
  target: string;
  /** 各ライブラリ固有の指定を渡す口。知らないライブラリは無視する */
  libraryOptions?: Record<string, unknown>;
};
