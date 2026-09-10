import { handleFixtureRequest } from '../../utils/fixture-route';
import { defineEventHandler } from 'h3';

export default defineEventHandler(handleFixtureRequest);
