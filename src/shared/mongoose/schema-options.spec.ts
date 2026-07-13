import { model, Schema } from 'mongoose';
import { baseSchemaOptions } from './schema-options';

describe('baseSchemaOptions toJSON', () => {
  it('expone id y oculta _id y password', () => {
    const schema = new Schema({ name: String, password: String }, baseSchemaOptions);
    const TestModel = model('SchemaOptionsTest', schema);
    const doc = new TestModel({ name: 'Ana', password: 'secret' });

    const json = doc.toJSON() as Record<string, unknown>;

    expect(typeof json.id).toBe('string');
    expect(json._id).toBeUndefined();
    expect(json.__v).toBeUndefined();
    expect(json.password).toBeUndefined();
    expect(json.name).toBe('Ana');
  });
});
