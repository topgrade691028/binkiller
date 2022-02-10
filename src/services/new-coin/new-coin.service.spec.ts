import { Test, TestingModule } from '@nestjs/testing';
import { NewCoinService } from './new-coin.service';

describe('NewCoinService', () => {
  let service: NewCoinService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NewCoinService],
    }).compile();

    service = module.get<NewCoinService>(NewCoinService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
