import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { AssessmentService } from './assessment.service';
import { AssessmentsController } from './assessments.controller';
import { ProgramService } from './program.service';
import { ProgramsController } from './programs.controller';
import { TaskRecordService } from './task-record.service';

@Module({
  imports: [AccessModule],
  controllers: [AssessmentsController, ProgramsController],
  providers: [AssessmentService, ProgramService, TaskRecordService],
})
export class ClinicalProgramsModule {}
