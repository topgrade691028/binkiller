import { Test, TestingModule } from '@nestjs/testing';
import { StrategyService } from './strategy.service';

describe('StrategyService', () => {
  let service: StrategyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StrategyService],
    }).compile();

    service = module.get<StrategyService>(StrategyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
