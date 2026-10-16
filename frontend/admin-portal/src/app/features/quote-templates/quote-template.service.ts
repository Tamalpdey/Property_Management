import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import type {
  ApiResponse,
  QuoteTemplate,
  QuoteTemplateAssignment,
} from "@lorne/contracts";
import { map } from "rxjs";
import { environment } from "../../../environments/environment";

@Injectable({ providedIn: "root" })
export class QuoteTemplateService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl + "/superadmin";
  catalog() {
    return this.http
      .get<ApiResponse<QuoteTemplate[]>>(`${this.base}/quote-templates`)
      .pipe(map((response) => response.data));
  }
  configure(template: QuoteTemplate) {
    return this.http
      .patch<ApiResponse<QuoteTemplate>>(
        `${this.base}/quote-templates/${template.code}`,
        {
          name: template.name,
          defaultNotes: template.defaultNotes,
          defaultTerms: template.defaultTerms,
          version: template.version,
        },
      )
      .pipe(map((response) => response.data));
  }
  assignment(id: string) {
    return this.http
      .get<ApiResponse<QuoteTemplateAssignment>>(
        `${this.base}/tenants/${id}/quote-templates`,
      )
      .pipe(map((response) => response.data));
  }
  assign(id: string, assignment: QuoteTemplateAssignment) {
    return this.http
      .patch<ApiResponse<QuoteTemplateAssignment>>(
        `${this.base}/tenants/${id}/quote-templates`,
        assignment,
      )
      .pipe(map((response) => response.data));
  }
}
