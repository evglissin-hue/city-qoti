// R2X: the sim's unit tests run with the place index verifier on, so a writer of a place input that
// forgets to bump the change counter (systems/places/inputs.ts) fails here, not in a player's town.
import { setPlaceVerify } from '../src/systems/places/inputs';

setPlaceVerify(true);
