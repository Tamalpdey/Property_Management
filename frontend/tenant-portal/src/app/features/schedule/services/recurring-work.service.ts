import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ApiResponse, CreateRecurringWorkTemplateRequest, RecurringWorkGenerationResult, RecurringWorkTemplate } from '@lorne/contracts';
import { map } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class RecurringWorkService {
  private readonly http = inject(HttpClient);

  list() {
    return this.http
      .get<ApiResponse<RecurringWorkTemplate[]>>(`${environment.apiBaseUrl}/tenant/recurring-work`)
      .pipe(map((response) => response.data));
  }

  create(request: CreateRecurringWorkTemplateRequest) {
    return this.http
      .post<ApiResponse<RecurringWorkTemplate>>(`${environment.apiBaseUrl}/tenant/recurring-work`, request)
      .pipe(map((response) => response.data));
  }

  generateDrafts(through?: string) {
    return this.http
      .post<ApiResponse<RecurringWorkGenerationResult>>(`${environment.apiBaseUrl}/tenant/recurring-work/generate-drafts`, null, {
        params: through ? { through } : {}
      })
      .pipe(map((response) => response.data));
  }
}
