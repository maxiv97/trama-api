import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ProposalsQueryDto } from '../../../src/proposals/dto/proposals-query.dto';

async function parse(query: Record<string, unknown>) {
  const dto = plainToInstance(ProposalsQueryDto, query);
  const errors = await validate(dto);
  return { dto, errors };
}

describe('ProposalsQueryDto', () => {
  it('sin status es válido (el controlador usa "en revisión" por defecto)', async () => {
    const { dto, errors } = await parse({});
    expect(errors).toHaveLength(0);
    expect(dto.status).toBeUndefined();
  });

  it('acepta varios estados separados por coma', async () => {
    const { dto, errors } = await parse({
      status: 'under_review, counteroffer',
    });
    expect(errors).toHaveLength(0);
    expect(dto.status).toEqual(['under_review', 'counteroffer']);
  });

  it('acepta el parámetro repetido', async () => {
    const { dto, errors } = await parse({
      status: ['no_agreement', 'cancelled'],
    });
    expect(errors).toHaveLength(0);
    expect(dto.status).toEqual(['no_agreement', 'cancelled']);
  });

  it('rechaza estados que no son de negociación', async () => {
    const { errors } = await parse({ status: 'under_review,sold' });
    expect(errors).toHaveLength(1);
  });
});
