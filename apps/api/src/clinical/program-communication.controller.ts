import { Body, Controller, Get, HttpStatus, Inject, Param, ParseUUIDPipe, Patch, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PERMISSIONS, type AuthUser, type ProgramCommunication, type ProgramNoteVersion } from '@abapro/shared';
import { RequireAnyPermissions, RequirePermissions } from '../common/auth.decorators';
import { CurrentUser } from '../common/current-user.decorator';
import { HomeActivityDto, ProgramAttachmentDto, ProgramNoteDto } from './clinical.dto';
import { ProgramCommunicationService } from './program-communication.service';

const uuid = () => new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });

/**
 * Program notes, attachments and home activities. Reads are open to parents for their linked child; the service
 * checks every access, and the permissions below are only the first gate.
 */
@Controller('v1')
export class ProgramCommunicationController {
  constructor(@Inject(ProgramCommunicationService) private readonly communication: ProgramCommunicationService) {}

  @Get('programs/:programId/communication')
  @RequireAnyPermissions(PERMISSIONS.programsView, PERMISSIONS.parentPortalView)
  forProgram(@CurrentUser() user: AuthUser, @Param('programId', uuid()) programId: string): Promise<ProgramCommunication> {
    return this.communication.forProgram(user, programId);
  }

  /** Every program of one child, for the parent portal. */
  @Get('clients/:clientId/program-communication')
  @RequireAnyPermissions(PERMISSIONS.programsView, PERMISSIONS.parentPortalView)
  forClient(@CurrentUser() user: AuthUser, @Param('clientId', uuid()) clientId: string): Promise<ProgramCommunication[]> {
    return this.communication.forClient(user, clientId);
  }

  @Post('programs/:programId/notes')
  @RequirePermissions(PERMISSIONS.programsView)
  addNote(@CurrentUser() user: AuthUser, @Param('programId', uuid()) programId: string, @Body() body: ProgramNoteDto): Promise<ProgramCommunication> {
    return this.communication.addNote(user, programId, body);
  }

  @Patch('programs/:programId/notes/:noteId')
  @RequirePermissions(PERMISSIONS.programsView)
  updateNote(
    @CurrentUser() user: AuthUser,
    @Param('programId', uuid()) programId: string,
    @Param('noteId', uuid()) noteId: string,
    @Body() body: ProgramNoteDto,
  ): Promise<ProgramCommunication> {
    return this.communication.updateNote(user, programId, noteId, body);
  }

  @Get('programs/:programId/notes/:noteId/history')
  @RequirePermissions(PERMISSIONS.programsView)
  noteHistory(
    @CurrentUser() user: AuthUser,
    @Param('programId', uuid()) programId: string,
    @Param('noteId', uuid()) noteId: string,
  ): Promise<ProgramNoteVersion[]> {
    return this.communication.noteHistory(user, programId, noteId);
  }

  @Post('programs/:programId/activities')
  @RequirePermissions(PERMISSIONS.programsView)
  addActivity(@CurrentUser() user: AuthUser, @Param('programId', uuid()) programId: string, @Body() body: HomeActivityDto): Promise<ProgramCommunication> {
    return this.communication.addActivity(user, programId, body);
  }

  @Patch('programs/:programId/activities/:activityId')
  @RequirePermissions(PERMISSIONS.programsView)
  updateActivity(
    @CurrentUser() user: AuthUser,
    @Param('programId', uuid()) programId: string,
    @Param('activityId', uuid()) activityId: string,
    @Body() body: HomeActivityDto,
  ): Promise<ProgramCommunication> {
    return this.communication.updateActivity(user, programId, activityId, body);
  }

  @Post('programs/:programId/attachments')
  @RequirePermissions(PERMISSIONS.documentsUpload)
  addAttachment(
    @CurrentUser() user: AuthUser,
    @Param('programId', uuid()) programId: string,
    @Body() body: ProgramAttachmentDto,
  ): Promise<ProgramCommunication> {
    return this.communication.addAttachment(user, programId, body);
  }

  @Get('programs/:programId/attachments/:documentId')
  @RequireAnyPermissions(PERMISSIONS.documentsDownload, PERMISSIONS.parentPortalView)
  async attachment(
    @CurrentUser() user: AuthUser,
    @Param('programId', uuid()) programId: string,
    @Param('documentId', uuid()) documentId: string,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.communication.attachment(user, programId, documentId);
    response
      .status(200)
      .set({
        'Content-Type': file.contentType,
        'Content-Disposition': `attachment; filename="${file.fileName.replace(/["\\\r\n]/g, '')}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(file.content);
  }
}
