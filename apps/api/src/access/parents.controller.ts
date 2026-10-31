import { Body, Controller, Get, HttpStatus, Inject, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { PERMISSIONS, type AuthUser, type ParentAccountSummary } from '@abapro/shared';
import { RequirePermissions } from '../common/auth.decorators';
import { CurrentUser } from '../common/current-user.decorator';
import { CreateParentDto, ParentClientsDto } from './access.dto';
import { ParentAccountsService } from './parent-accounts.service';

const uuid = () => new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.NOT_FOUND });

/** Parent accounts and their linked clients. Creating an account also needs an organisation administrator. */
@Controller('v1/parents')
export class ParentsController {
  constructor(@Inject(ParentAccountsService) private readonly parents: ParentAccountsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.guardiansManage)
  list(@CurrentUser() user: AuthUser): Promise<ParentAccountSummary[]> {
    return this.parents.list(user);
  }

  @Get(':userId')
  @RequirePermissions(PERMISSIONS.guardiansManage)
  get(@CurrentUser() user: AuthUser, @Param('userId', uuid()) userId: string): Promise<ParentAccountSummary> {
    return this.parents.get(user, userId);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.guardiansManage)
  create(@CurrentUser() user: AuthUser, @Body() body: CreateParentDto): Promise<ParentAccountSummary> {
    return this.parents.create(user, body);
  }

  @Put(':userId/clients')
  @RequirePermissions(PERMISSIONS.guardiansManage)
  setClients(@CurrentUser() user: AuthUser, @Param('userId', uuid()) userId: string, @Body() body: ParentClientsDto): Promise<ParentAccountSummary> {
    return this.parents.setClients(user, userId, body.clientIds);
  }
}
