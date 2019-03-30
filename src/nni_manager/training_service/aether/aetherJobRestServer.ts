/**
 * Copyright (c) Microsoft Corporation
 * All rights reserved.
 *
 * MIT License
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
 * documentation files (the "Software"), to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
 * to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
 * BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
 * DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

'use strict';

import * as assert from 'assert';
import * as component from '../../common/component';
import { Inject } from 'typescript-ioc';
import { AetherTrainingService, AetherTrialJobDetail } from './aetherTrainingService'
import bodyParser = require('body-parser');
import { RestServer } from 'common/restServer';
import { getExperimentId, getBasePort } from 'common/experimentStartupInfo';
import { Router, Request, Response } from 'express';

/**
 * Aether Training Service Rest Server, provides rest API to support Aether job update
 */
@component.Singleton
export class AetherJobRestServer extends RestServer {
    @Inject
    private readonly API_ROOT_URL : string = 'api/v1/nni-aether';
    private readonly NNI_METRICS_PATTERN: string = `NNISDK_MEb'(?<metrics>.*?)'`;
    private readonly aetherTrainingService : AetherTrainingService;
    private readonly expId: string = getExperimentId();

    constructor() {
        super();
        const basePort: number = getBasePort();
        assert(basePort && basePort > 1024);
        this.port = basePort + 1;         

        this.aetherTrainingService = component.get(AetherTrainingService);
    }

    public get clusterRestServerPort(): number {
        if(!this.port) {
            throw new Error('PAI Rest server port is undefined');
        }
        return this.port;
    }

    protected registerRestHandler() {
        this.app.use(bodyParser.json());
        this.app.use(this.API_ROOT_URL, this.createRestHandler());
    }

    private createRestHandler(): Router {
        const router: Router = Router();

        //tslint:desable-next-line:typedef
        router.use((req: Request, res: Response, next) => {
            this.log.info(`${req.method}: ${req.url}: body:\n${JSON.stringify(req.body, undefined, 4)}`);
            res.setHeader('Content-Type', 'application/json');
            next();
        });

        // report metric for trial
        router.post(`update-metrics/${this.expId}/:trialId`, (req: Request, res: Response) => {
            try {
                this.log.debug(`Get update-metrics request, trial job id: ${req.params.trialId}`);
                this.log.debug(`update-metrics body: ${JSON.stringify(req.body)}`);

                this.handleTrialMetrics(req.body.jobId, req.body.metrics);
            } catch(err) {
                this.log.error(err.message);
                res.status(500);
                res.send(err.message);
            }
            res.send();
        });

        // update status of trial 
        router.post(`update-status/${this.expId}/:trialId`, (req: Request, res: Response) => {
            try {
                this.log.debug(`update status of trial job ${req.params.trialId}: ${JSON.stringify(req.body)}`);
                var trial = this.aetherTrainingService._getTrialJob(req.params.trialId);
                trial.status = req.body.status;
            } catch(err) {
                this.log.error(err.message);
                res.status(500);
                res.send(err.message);
            }
        });

        // return aether expriment id
        router.post(`update-guid/${this.expId}/:trialId`, (req: Request, res: Response) => {
            try{
                this.log.debug(`aether GUID of trial job ${req.params.trialId}: ${JSON.stringify(req.body)}`);
                var trial = this.aetherTrainingService._getTrialJob(req.params.trialId);
                trial.guid.resolve(req.body.guid);
            } catch(err) {
                this.log.error(err.message);
                res.status(500);
                res.send(err.message);
            }
        });

        // get trial information
        router.get(`trial-meta/${this.expId}/:trialId`, (req: Request, res: Response) => {
            this.log.debug(`sending meta-data for trial job ${req.params.trialId}: ${JSON.stringify(req.body)}`);
        });
        return router;
    }
    

    protected handleTrialMetrics(jobId: string, metrics: any[]) {
        for (const singleMetric of metrics) {
            this.aetherTrainingService.MetricsEmitter.emit('metric', {
                id: jobId,
                data: singleMetric
            });
        }
    }
}