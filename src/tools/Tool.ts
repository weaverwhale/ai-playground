import { z } from 'zod';

export type ToolFunction<TSchema extends z.ZodType> = {
  name: string;
  description: string;
  parameters: TSchema;
};

export class Tool<TSchema extends z.ZodType> {
  public function: ToolFunction<TSchema>;

  constructor(
    schema: TSchema,
    name: string,
    description: string,
    public execute: (params: z.infer<TSchema>) => Promise<string>
  ) {
    this.function = {
      name,
      description,
      parameters: schema,
    };
  }
}

export function createTool<TSchema extends z.ZodType>(
  schema: TSchema,
  name: string,
  description: string,
  execute: (params: z.infer<TSchema>) => Promise<string>
): Tool<TSchema> {
  return new Tool(schema, name, description, execute);
}
