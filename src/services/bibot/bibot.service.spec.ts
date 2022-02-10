import { Test, TestingModule } from '@nestjs/testing';
import { BibotService } from './bibot.service';

describe('BibotService', () => {
  let service: BibotService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BibotService],
    }).compile();

    service = module.get<BibotService>(BibotService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
