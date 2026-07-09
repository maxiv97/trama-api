import { SchemaOptions } from 'mongoose';

export const baseSchemaOptions: SchemaOptions = {
  versionKey: false,
  toJSON: {
    virtuals: true,
    transform(_doc, ret: Record<string, unknown>) {
      ret.id = String(ret._id);
      delete ret._id;
      delete ret.password;
      return ret;
    },
  },
};
