import { z } from 'zod';

export type ToolFunction<TSchema extends z.ZodType> = {
  name: string;
  description: string;
  parameters: TSchema;
};

export class Tool<TParams extends z.ZodType, TResponse> {
  public function: ToolFunction<TParams>;

  constructor(
    public schema: TParams,
    public name: string,
    public description: string,
    public execute: (params: z.infer<TParams>) => Promise<TResponse>
  ) {
    this.function = {
      name,
      description,
      parameters: schema,
    };
  }
}

export function createTool<TParams extends z.ZodType, TResponse>(
  schema: TParams,
  name: string,
  description: string,
  execute: (params: z.infer<TParams>) => Promise<TResponse>
): Tool<TParams, TResponse> {
  return new Tool(schema, name, description, execute);
}
