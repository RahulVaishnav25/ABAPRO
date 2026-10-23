import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { PERMISSIONS, type AuthUser, type CollectedObservation, type SessionGraphPoint, type TherapySessionDetail, type TherapySessionSummary } from '@abapro/shared';
import { RequireAnyPermissions, RequirePermissions } from '../common/auth.decorators';
import { CurrentUser } from '../common/current-user.decorator';
import { ObservationBody, SessionNoteBody, StartSessionBody, TrialBody } from './session.dto';
import { SessionCollectionService } from './session.service';

@Controller('v1/sessions')
export class SessionsController {
  constructor(@Inject(SessionCollectionService) private readonly sessions: SessionCollectionService) {}

  @Get('graph')
  @RequireAnyPermissions(PERMISSIONS.graphsView, PERMISSIONS.reportsView, PERMISSIONS.progressView)
  graph(@CurrentUser() user: AuthUser, @Query('clientId') clientId = ''): Promise<SessionGraphPoint[]> {
    return this.sessions.graph(user, clientId);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.sessionsView)
  list(
    @CurrentUser() user: AuthUser,
    @Query('clientId') clientId?: string,
    @Query('status') status?: string,
  ): Promise<TherapySessionSummary[]> {
    return this.sessions.list(user, clientId, status);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.observationsRecord)
  start(@CurrentUser() user: AuthUser, @Body() body: StartSessionBody): Promise<TherapySessionDetail> {
    return this.sessions.start(user, body);
  }

  @Get(':sessionId')
  @RequirePermissions(PERMISSIONS.sessionsView)
  get(@CurrentUser() user: AuthUser, @Param('sessionId') sessionId: string): Promise<TherapySessionDetail> {
    return this.sessions.get(user, sessionId);
  }

  @Patch(':sessionId')
  @RequirePermissions(PERMISSIONS.observationsRecord)
  update(@CurrentUser() user: AuthUser, @Param('sessionId') sessionId: string, @Body() body: SessionNoteBody): Promise<TherapySessionDetail> {
    return this.sessions.update(user, sessionId, body);
  }

  @Post(':sessionId/interrupt')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.observationsRecord)
  interrupt(@CurrentUser() user: AuthUser, @Param('sessionId') sessionId: string): Promise<TherapySessionDetail> {
    return this.sessions.interrupt(user, sessionId);
  }

  @Post(':sessionId/resume')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.observationsRecord)
  resume(@CurrentUser() user: AuthUser, @Param('sessionId') sessionId: string): Promise<TherapySessionDetail> {
    return this.sessions.resume(user, sessionId);
  }

  @Post(':sessionId/complete')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.observationsRecord)
  complete(@CurrentUser() user: AuthUser, @Param('sessionId') sessionId: string, @Body() body: SessionNoteBody): Promise<TherapySessionDetail> {
    return this.sessions.complete(user, sessionId, body.note);
  }

  @Post(':sessionId/cancel')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.observationsRecord)
  cancel(@CurrentUser() user: AuthUser, @Param('sessionId') sessionId: string, @Body() body: SessionNoteBody): Promise<TherapySessionDetail> {
    return this.sessions.cancel(user, sessionId, body.reason);
  }

  @Post(':sessionId/observations')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.observationsRecord)
  record(@CurrentUser() user: AuthUser, @Param('sessionId') sessionId: string, @Body() body: ObservationBody): Promise<CollectedObservation> {
    return this.sessions.record(user, sessionId, body);
  }

  @Post(':sessionId/observations/:observationId/trials')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.observationsRecord)
  addTrial(
    @CurrentUser() user: AuthUser,
    @Param('sessionId') sessionId: string,
    @Param('observationId') observationId: string,
    @Body() body: TrialBody,
  ): Promise<CollectedObservation> {
    return this.sessions.addTrial(user, sessionId, observationId, body);
  }

  @Post(':sessionId/observations/:observationId/trials/:trialId/undo')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.observationsRecord)
  undoTrial(
    @CurrentUser() user: AuthUser,
    @Param('sessionId') sessionId: string,
    @Param('observationId') observationId: string,
    @Param('trialId') trialId: string,
    @Body() body: SessionNoteBody,
  ): Promise<CollectedObservation> {
    return this.sessions.undoTrial(user, sessionId, observationId, trialId, body.reason);
  }

  @Post(':sessionId/observations/:observationId/void')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.observationsRecord)
  voidObservation(
    @CurrentUser() user: AuthUser,
    @Param('sessionId') sessionId: string,
    @Param('observationId') observationId: string,
    @Body() body: SessionNoteBody,
  ): Promise<CollectedObservation> {
    return this.sessions.voidObservation(user, sessionId, observationId, body.reason);
  }

  @Post(':sessionId/observations/:observationId/amend')
  @HttpCode(200)
  @RequirePermissions(PERMISSIONS.observationsRecord)
  amend(
    @CurrentUser() user: AuthUser,
    @Param('sessionId') sessionId: string,
    @Param('observationId') observationId: string,
    @Body() body: ObservationBody,
  ): Promise<CollectedObservation> {
    return this.sessions.amend(user, sessionId, observationId, body);
  }

  @Get(':sessionId/observations/:observationId/history')
  @RequirePermissions(PERMISSIONS.sessionsView)
  history(
    @CurrentUser() user: AuthUser,
    @Param('sessionId') sessionId: string,
    @Param('observationId') observationId: string,
  ): Promise<CollectedObservation[]> {
    return this.sessions.history(user, sessionId, observationId);
  }
}
